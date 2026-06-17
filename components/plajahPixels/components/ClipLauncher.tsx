/**
 * ClipLauncher — Resolume-style clip matrix for Plajah Pixels.
 *
 * Layout (bottom of screen, slides up):
 *   ┌─ scene-launch bar ─────────────────────────────────────────────┐
 *   │  [Layer 3 controls] │ clips →  →  →  (scrollable columns)      │
 *   │  [Layer 2 controls] │ clips →  →  →                            │
 *   │  [Layer 1 controls] │ clips →  →  →                            │
 *   └─ source browser (GENERATORS / MILKDROP / MEDIA) ───────────────┘
 *
 * Layers (bottom = first rendered, top = last / highest z):
 *   Layer 1 (BG)  → onSetBgMedia  (background media or static color)
 *   Layer 2 (VIZ) → onApply({mode}) (audio-reactive generator scene)
 *   Layer 3 (FX)  → FX toggles + Milkdrop
 *
 * MIDI (Maschine Studio 4×4, notes 60-75):
 *   Pad rows 1-3  → fire individual clip: layerIdx = row, colIdx = col
 *   Pad row  4    → scene-launch column: fires clips 0-3 across all layers
 *   Formula: padIdx = note-60; col = padIdx%4; row = padIdx>>2
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Play, Square, ChevronLeft, ChevronRight, Upload, Plus,
  Zap, Disc, Image, Video, Wind, Radio, Search, SkipBack, SkipForward, Shuffle,
  Eye, EyeOff, Layers,
} from 'lucide-react';
import { VisualizationConfig, VisualizerMode, BackgroundMedia, BlendMode } from '../types';
import { SCENE_CATALOG, SceneEntry } from '../engine/sceneCatalog';
import { MidiEventData, rotatePalette } from '../services/midiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipType = 'empty' | 'media' | 'generator' | 'milkdrop' | 'color';

export interface LauncherClip {
  id:            string;
  type:          ClipType;
  name:          string;
  color:         string;
  // media
  mediaUrl?:     string;
  mediaType?:    'video' | 'image';
  loop?:         boolean;
  // generator (maps to our scene catalog)
  sceneMode?:    string;
  sceneKind?:    'classic' | 'canvas' | 'gl';
  // milkdrop
  milkdropIdx?:  number;
  milkdropName?: string;
  // color fill
  fillColor?:    string;
}

export interface LauncherLayer {
  id:          string;
  name:        string;
  blendMode:   string;
  opacity:     number;   // 0–1
  bypassed:    boolean;
  muted:       boolean;
  clips:       (LauncherClip | null)[];  // indexed by column
  activeCol:   number | null;
}

export interface MilkdropControls {
  enabled:     boolean;
  name:        string;
  count:       number;
  idx:         number;
  onToggle:    () => void;
  onPrev:      () => void;
  onNext:      () => void;
  onRandom:    () => void;
  onSetIdx:    (i: number) => void;
  /** Thumbnail map: preset name → JPEG data URL */
  thumbnails?: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BLEND_OPTIONS = ['Normal','Screen','Add','Multiply','Overlay','Lighten','Exclusion','Difference'];

const NUM_COLS = 8;   // visible scrollable columns per layer

const ACCENT_COLORS = ['#8b5cf6','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#a78bfa'];

function makeDefaultLayers(): LauncherLayer[] {
  // Layer 1 – BG (background media)
  const bg: LauncherLayer = {
    id: 'bg', name: 'BG', blendMode: 'Normal', opacity: 1, bypassed: false, muted: false,
    clips: Array(NUM_COLS).fill(null),
    activeCol: null,
  };

  // Layer 2 – VIZ (audio-reactive generator scenes)
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
    })),
    activeCol: 0,
  };

  // Layer 3 – FX (effects / Milkdrop)
  const fxClips: LauncherClip[] = [
    { id: 'fx-milk',  type: 'milkdrop',   name: 'MILKDROP',  color: '#c084fc', milkdropIdx: 0 },
    { id: 'fx-milk2', type: 'milkdrop',   name: 'MILK NEXT', color: '#a855f7', milkdropIdx: 1 },
    { id: 'fx-glitch',type: 'generator',  name: 'GLITCH',    color: '#22d3ee', sceneMode: '__fx_glitch'   },
    { id: 'fx-bass',  type: 'generator',  name: 'BASS↑',     color: '#ef4444', sceneMode: '__fx_bass'     },
    ...Array(NUM_COLS - 4).fill(null).map((_, i) => null),
  ];
  const fx: LauncherLayer = {
    id: 'fx', name: 'FX', blendMode: 'Add', opacity: 0.8, bypassed: false, muted: false,
    clips: fxClips,
    activeCol: null,
  };

  return [bg, viz, fx];
}

const MATRIX_KEY = 'plajah-clip-launcher-v1';

// Canvas2D composite operation names mapped from launcher blend mode labels
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
    const saved = JSON.parse(raw) as LauncherLayer[];
    return saved;
  } catch {
    return makeDefaultLayers();
  }
}
function saveLayers(ls: LauncherLayer[]) {
  try {
    // Don't persist blob URLs (they don't survive reload)
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
  onSetBgMedia:  (media: BackgroundMedia | null) => void;
}

// ─── Clip Cell ────────────────────────────────────────────────────────────────

interface CellProps {
  clip:       LauncherClip | null;
  layerIdx:   number;
  colIdx:     number;
  active:     boolean;
  flash:      boolean;
  onActivate: () => void;
  onDrop:     (file: File) => void;
  onAssign:   (clip: LauncherClip) => void;
}

const ClipCell: React.FC<CellProps> = ({
  clip, layerIdx, colIdx, active, flash, onActivate, onDrop,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const padNum = layerIdx * 4 + colIdx; // 0-based pad index (only first 4 cols have pads)

  const accent = clip?.color ?? '#444';

  return (
    <div
      className="relative flex-shrink-0 cursor-pointer overflow-hidden select-none transition-all group"
      style={{
        width: 88, height: '100%',
        background: flash ? '#fff'
                  : active ? `linear-gradient(160deg,${accent}44,${accent}18)`
                  : dragOver ? `${accent}22`
                  : '#111118',
        border: flash     ? '1px solid rgba(255,255,255,0.9)'
              : active    ? `1px solid ${accent}cc`
              : dragOver  ? `1px solid ${accent}`
              : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 3,
        transform: flash ? 'scale(0.93)' : 'scale(1)',
        boxShadow: active && !flash ? `0 0 0 1px ${accent}55, 0 0 16px ${accent}33` : 'none',
      }}
      onClick={clip ? onActivate : () => fileRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f && (f.type.startsWith('video/') || f.type.startsWith('image/'))) onDrop(f);
      }}
    >
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

      {/* Content overlay */}
      <div className="relative z-10 h-full flex flex-col justify-between p-1 pl-2">
        {/* Top row */}
        <div className="flex items-center justify-between">
          {colIdx < 4 && layerIdx < 3 && (
            <span className="text-[6px] font-black font-mono" style={{ color: flash ? '#000' : 'rgba(255,255,255,0.2)' }}>
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
              <div className="text-[9px] font-black uppercase leading-tight truncate"
                style={{ color: flash ? '#000' : '#ffffffcc' }}>
                {clip.name}
              </div>
              <div className="text-[6px] uppercase tracking-widest mt-0.5"
                style={{ color: flash ? '#333' : active ? `${accent}99` : 'rgba(255,255,255,0.2)' }}>
                {clip.type === 'generator' ? (clip.sceneKind === 'gl' ? 'GLSL' : 'GEN')
                : clip.type === 'milkdrop' ? 'MILK'
                : clip.type === 'media'    ? (clip.mediaType ?? 'MEDIA').toUpperCase()
                : clip.type === 'color'    ? 'SOLID'
                : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onDrop(f); }} />
    </div>
  );
};

// ─── Layer Row ────────────────────────────────────────────────────────────────

interface LayerRowProps {
  layer:       LauncherLayer;
  layerIdx:    number;
  scrollLeft:  number;
  flashedPads: Set<number>;
  onUpdateLayer: (patch: Partial<LauncherLayer>) => void;
  onFireClip:    (colIdx: number) => void;
  onDropMedia:   (colIdx: number, file: File) => void;
  onAssignClip:  (colIdx: number, clip: LauncherClip) => void;
}

const CELL_HEIGHT = 72;

const LayerRow: React.FC<LayerRowProps> = ({
  layer, layerIdx, scrollLeft, flashedPads,
  onUpdateLayer, onFireClip, onDropMedia, onAssignClip,
}) => {
  const isFlashed = (ci: number) => flashedPads.has(layerIdx * 4 + ci);
  const layerColor = layerIdx === 0 ? '#6366f1' : layerIdx === 1 ? '#8b5cf6' : '#06b6d4';

  return (
    <div className="flex items-stretch" style={{ height: CELL_HEIGHT }}>
      {/* ── Layer controls sidebar ───────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col justify-between px-2 py-1"
        style={{
          width: 96,
          background: layer.bypassed ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.4)',
          borderRight: `1px solid ${layerColor}33`,
          opacity: layer.muted ? 0.4 : 1,
        }}
      >
        {/* Layer name + bypass */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: layerColor }}>
            {layer.name}
          </span>
          <button
            onClick={() => onUpdateLayer({ bypassed: !layer.bypassed })}
            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black transition-all"
            style={{
              background: layer.bypassed ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.05)',
              border: layer.bypassed ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
              color: layer.bypassed ? '#ef4444' : 'rgba(255,255,255,0.3)',
            }}
            title="Bypass layer"
          >⊘</button>
        </div>

        {/* Blend mode */}
        <select
          value={layer.blendMode}
          onChange={e => onUpdateLayer({ blendMode: e.target.value })}
          className="text-[8px] uppercase font-bold rounded appearance-none px-1 py-0.5 cursor-pointer"
          style={{
            background: `${layerColor}18`, border: `1px solid ${layerColor}44`,
            color: layerColor, outline: 'none',
          }}
        >
          {BLEND_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Opacity bar */}
        <div className="flex items-center gap-1">
          <input
            type="range" min="0" max="100" step="1"
            value={Math.round(layer.opacity * 100)}
            onChange={e => onUpdateLayer({ opacity: Number(e.target.value) / 100 })}
            className="flex-1 h-1 appearance-none rounded cursor-pointer"
            style={{ accentColor: layerColor }}
          />
          <span className="text-[7px] font-mono w-6 text-right" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {Math.round(layer.opacity * 100)}
          </span>
        </div>

        {/* Mute toggle */}
        <button
          onClick={() => onUpdateLayer({ muted: !layer.muted })}
          className="flex items-center gap-1 transition-all"
          style={{ color: layer.muted ? '#ef4444' : 'rgba(255,255,255,0.25)', fontSize: 7 }}
        >
          {layer.muted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          <span className="text-[7px] uppercase tracking-widest">{layer.muted ? 'MUTED' : 'LIVE'}</span>
        </button>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Source Browser ───────────────────────────────────────────────────────────

type SourceTab = 'generators' | 'milkdrop' | 'media';

interface SourceBrowserProps {
  milkdropControls: MilkdropControls;
  onAssignToLayer:  (layerIdx: number, colIdx: number, clip: LauncherClip) => void;
  layers:           LauncherLayer[];
  config:           VisualizationConfig;
}

const SourceBrowser: React.FC<SourceBrowserProps> = ({
  milkdropControls, onAssignToLayer, layers,
}) => {
  const [tab, setTab] = useState<SourceTab>('generators');
  const [search, setSearch] = useState('');
  const [milkdropNames, setMilkdropNames] = useState<string[]>([]);
  const [loadingMilk, setLoadingMilk] = useState(false);
  const [milkLoaded, setMilkLoaded] = useState(false);

  // Load Milkdrop preset names lazily when tab opens
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

  const generators = useMemo(() =>
    SCENE_CATALOG.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())),
  [search]);

  const filteredMilk = useMemo(() =>
    milkdropNames.filter(n => !search || n.toLowerCase().includes(search.toLowerCase())).slice(0, 120),
  [milkdropNames, search]);

  return (
    <div className="flex flex-col" style={{ height: 110, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Source tabs */}
      <div className="flex items-center gap-0 px-2 shrink-0" style={{ height: 28, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          ['generators', Zap,   'GENERATORS'] as const,
          ['milkdrop',   Wind,  'MILKDROP']   as const,
          ['media',      Image, 'MEDIA']       as const,
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 h-full text-[8px] font-black uppercase tracking-widest transition-all border-b-2"
            style={{
              borderBottomColor: tab === id ? '#8b5cf6' : 'transparent',
              color: tab === id ? '#c084fc' : 'rgba(255,255,255,0.3)',
            }}
          >
            <Icon className="w-3 h-3" />{label}
          </button>
        ))}
        {/* Search */}
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

      {/* Content area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-1 h-full items-stretch p-1">

          {/* ── Generators ── */}
          {tab === 'generators' && generators.map((s, i) => {
            const color = s.kind === 'gl' ? '#22d3ee' : s.kind === 'canvas' ? '#a78bfa' : '#8b5cf6';
            return (
              <div
                key={s.mode}
                className="flex-shrink-0 flex flex-col justify-between cursor-pointer rounded overflow-hidden transition-all hover:scale-[1.04]"
                style={{
                  width: 72, background: `${color}18`,
                  border: `1px solid ${color}44`,
                  padding: '4px 6px',
                }}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/plajah-clip', JSON.stringify({
                    id: `gen-${s.mode}-${Date.now()}`,
                    type: 'generator', name: s.name, color,
                    sceneMode: s.mode, sceneKind: s.kind,
                  } as LauncherClip));
                }}
                title={`${s.name} — ${s.cat}\nDrag to a layer cell or click to preview`}
              >
                <div className="text-[6px] uppercase tracking-widest" style={{ color: `${color}88` }}>
                  {s.kind === 'gl' ? 'GLSL' : s.kind === 'canvas' ? 'GEN' : 'AUDIO'}
                </div>
                <div className="text-[9px] font-black uppercase leading-tight" style={{ color: '#ffffffcc' }}>
                  {s.name}
                </div>
                <div className="text-[6px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.cat.split('·')[1]?.trim()}</div>
              </div>
            );
          })}

          {/* ── Milkdrop ── */}
          {tab === 'milkdrop' && (
            <>
              {/* Quick controls */}
              <div className="flex-shrink-0 flex flex-col justify-center gap-1.5 pr-2" style={{ width: 100, borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                <button
                  onClick={milkdropControls.onToggle}
                  className="flex items-center justify-center gap-1 text-[8px] font-black uppercase rounded py-1 px-2 transition-all"
                  style={{
                    background: milkdropControls.enabled ? 'rgba(192,132,252,0.35)' : 'rgba(255,255,255,0.05)',
                    border: milkdropControls.enabled ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.1)',
                    color: milkdropControls.enabled ? '#c084fc' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Wind className="w-3 h-3" />
                  {milkdropControls.enabled ? 'ON' : 'OFF'}
                </button>
                <div className="flex gap-1">
                  <button onClick={milkdropControls.onPrev}   className="flex-1 flex items-center justify-center py-1 rounded text-white/30 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}><SkipBack    className="w-3 h-3" /></button>
                  <button onClick={milkdropControls.onRandom} className="flex-1 flex items-center justify-center py-1 rounded text-white/30 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}><Shuffle     className="w-3 h-3" /></button>
                  <button onClick={milkdropControls.onNext}   className="flex-1 flex items-center justify-center py-1 rounded text-white/30 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}><SkipForward className="w-3 h-3" /></button>
                </div>
                {milkdropControls.name && (
                  <div className="text-[6px] text-white/30 leading-snug break-all text-center">
                    {milkdropControls.name.slice(0, 48)}
                  </div>
                )}
              </div>

              {/* Preset grid */}
              {loadingMilk ? (
                <div className="flex items-center px-4 text-[9px] text-white/30">Loading presets…</div>
              ) : (
                filteredMilk.map((name, i) => {
                  const isActive = milkdropControls.name === name;
                  const thumb = milkdropControls.thumbnails?.[name];
                  return (
                    <div
                      key={name}
                      className="flex-shrink-0 flex flex-col justify-end cursor-pointer rounded overflow-hidden transition-all hover:scale-[1.04] relative"
                      style={{
                        width: 80,
                        backgroundImage: thumb ? `url(${thumb})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        background: !thumb ? (isActive ? 'rgba(192,132,252,0.25)' : 'rgba(124,58,237,0.12)') : undefined,
                        border: isActive ? '1px solid #c084fc' : '1px solid rgba(192,132,252,0.2)',
                        padding: '4px 6px',
                      }}
                      title={name}
                      onClick={() => milkdropControls.onSetIdx(i)}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('application/plajah-clip', JSON.stringify({
                          id: `milk-${i}-${Date.now()}`,
                          type: 'milkdrop', name: name.slice(0, 20),
                          color: '#c084fc',
                          milkdropIdx: i, milkdropName: name,
                        } as LauncherClip));
                      }}
                    >
                      {thumb && <div className="absolute inset-0 bg-black/50" />}
                      <div className="relative z-10">
                        <div className="text-[6px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(192,132,252,0.8)' }}>MILK</div>
                        <div className="text-[8px] font-bold leading-tight text-white/90 truncate drop-shadow">{name.slice(0, 22)}</div>
                        {isActive && <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-purple-400 mx-auto" />}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* ── Media (upload prompt) ── */}
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

const ClipLauncher: React.FC<Props> = ({
  config, onApply, milkdrop, onSetBgMedia,
}) => {
  const [layers,       setLayers]       = useState<LauncherLayer[]>(() => loadLayers());
  const [scrollLeft,   setScrollLeft]   = useState(0);
  const [flashedPads,  setFlashedPads]  = useState<Set<number>>(new Set());
  const [midiActive,   setMidiActive]   = useState(false);

  const configRef   = useRef(config);
  const milkRef     = useRef(milkdrop);
  const layersRef   = useRef(layers);
  useEffect(() => { configRef.current = config;   }, [config]);
  useEffect(() => { milkRef.current   = milkdrop; }, [milkdrop]);
  useEffect(() => { layersRef.current = layers; saveLayers(layers); }, [layers]);

  const CELL_W = 88;
  const GAP    = 4;
  const STEP   = CELL_W + GAP;
  const colCount = layers[0]?.clips.length ?? NUM_COLS;

  // ── Video preload cache (ensures clips are in memory before trigger) ─────────
  const preloadRef = useRef<Record<string, HTMLVideoElement>>({});

  // ── Fire a clip in a specific layer + column ────────────────────────────────
  const fireClip = useCallback((layerIdx: number, colIdx: number, ls?: LauncherLayer[]) => {
    const lrs = ls ?? layersRef.current;
    const layer = lrs[layerIdx];
    if (!layer) return;
    const clip = layer.clips[colIdx];

    // Toggle: if already active, stop
    setLayers(prev => prev.map((l, li) =>
      li === layerIdx ? { ...l, activeCol: l.activeCol === colIdx ? null : colIdx } : l
    ));

    if (!clip) return;
    if (layer.bypassed || layer.muted) return;

    // Resolve layer blend mode for patching
    const layerBlend = layer.blendMode.toLowerCase();
    const resolvedBlend = (BLEND_MAP[layerBlend] || layerBlend) as BlendMode;

    if (clip.type === 'generator') {
      if (clip.sceneMode === '__fx_glitch') {
        onApply({ enableGlitch: !(configRef.current as any).enableGlitch } as any);
      } else if (clip.sceneMode === '__fx_bass') {
        onApply({ enableBassShake: !(configRef.current as any).enableBassShake } as any);
      } else if (clip.sceneMode) {
        // VIZ layer (layerIdx === 1): also apply the layer's blend mode
        const patch: Partial<VisualizationConfig> = { mode: clip.sceneMode as VisualizerMode };
        if (layerIdx === 1) {
          patch.blendMode = resolvedBlend;
        }
        onApply(patch);
      }
    } else if (clip.type === 'milkdrop') {
      // Set preset index FIRST, then toggle — order matters so the right preset loads
      if (clip.milkdropIdx !== undefined) {
        milkRef.current.onSetIdx(clip.milkdropIdx);
      }
      milkRef.current.onToggle();
    } else if (clip.type === 'media' && clip.mediaUrl) {
      // Apply the BG layer's blend mode when firing a media clip
      onSetBgMedia({ url: clip.mediaUrl, type: clip.mediaType ?? 'video', id: clip.id });
      if (layerIdx === 0) {
        onApply({ blendMode: resolvedBlend });
      }
    } else if (clip.type === 'color' && clip.fillColor) {
      onSetBgMedia(null);
    }
  }, [onApply, onSetBgMedia]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scene launch (fires one column across all layers simultaneously) ─────────
  const launchScene = useCallback((colIdx: number) => {
    const lrs = layersRef.current;
    lrs.forEach((_, li) => fireClip(li, colIdx, lrs));
  }, [fireClip]);

  // ── MIDI note handler ────────────────────────────────────────────────────────
  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout>;
    let activeTimer: ReturnType<typeof setTimeout>;

    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as MidiEventData;
      if (!d) return;
      const note = d.note;
      if (note < 60 || note > 75) return;
      const padIdx = note - 60;
      const row = padIdx >> 2;   // 0-3
      const col = padIdx % 4;    // 0-3

      // Flash visual
      setFlashedPads(prev => new Set([...prev, padIdx]));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setFlashedPads(new Set()), 180);

      // MIDI active indicator
      setMidiActive(true);
      clearTimeout(activeTimer);
      activeTimer = setTimeout(() => setMidiActive(false), 800);

      // Row 3 (top Maschine row = pads 12-15) = scene launch
      if (row === 3) {
        launchScene(col);
      } else {
        // Rows 0-2 fire individual layer clips
        fireClip(row, col);
      }
    };

    window.addEventListener('plajah-midi-note-on', handler);
    return () => {
      window.removeEventListener('plajah-midi-note-on', handler);
      clearTimeout(flashTimer);
      clearTimeout(activeTimer);
    };
  }, [fireClip, launchScene]);

  // ── Layer update helper ──────────────────────────────────────────────────────
  const updateLayer = useCallback((li: number, patch: Partial<LauncherLayer>) => {
    setLayers(prev => prev.map((l, i) => i === li ? { ...l, ...patch } : l));
  }, []);

  // ── Drop media file onto a cell ──────────────────────────────────────────────
  const dropMedia = useCallback((li: number, ci: number, file: File) => {
    const url = URL.createObjectURL(file);
    const mediaType: 'video' | 'image' = file.type.startsWith('video/') ? 'video' : 'image';
    const clip: LauncherClip = {
      id: `media-${li}-${ci}-${Date.now()}`,
      type: 'media', name: file.name.replace(/\.[^.]+$/, '').slice(0, 18).toUpperCase(),
      color: '#6366f1', mediaUrl: url, mediaType, loop: true,
    };
    // Preload video into browser memory so first trigger has no lag
    if (mediaType === 'video' && !preloadRef.current[url]) {
      const preloadEl = document.createElement('video');
      preloadEl.src = url;
      preloadEl.preload = 'auto';
      preloadEl.muted = true;
      preloadEl.load();
      preloadRef.current[url] = preloadEl;
    }
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map((c, ci2) => ci2 === ci ? clip : c) } : l
    ));
  }, []);

  // ── Assign clip (from drag or source browser) ────────────────────────────────
  const assignClip = useCallback((li: number, ci: number, clip: LauncherClip) => {
    setLayers(prev => prev.map((l, i) =>
      i === li ? { ...l, clips: l.clips.map((c, ci2) => ci2 === ci ? { ...clip, id: `${clip.id}-${Date.now()}` } : c) } : l
    ));
  }, []);

  // Handle drops from source browser onto cells
  const handleLayerDrop = useCallback((li: number, ci: number, e: React.DragEvent) => {
    e.preventDefault();
    const clipData = e.dataTransfer.getData('application/plajah-clip');
    if (clipData) {
      try { assignClip(li, ci, JSON.parse(clipData)); } catch { /* ignore */ }
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('image/'))) {
      dropMedia(li, ci, file);
    }
  }, [assignClip, dropMedia]);

  // ── Milkdrop bridge: when milkdrop layer is active route FX ─────────────────
  const milkdropForBrowser: MilkdropControls = useMemo(() => ({
    ...milkdrop,
    onSetIdx: milkdrop.onSetIdx,
  }), [milkdrop]);

  // ── Scroll helpers ────────────────────────────────────────────────────────────
  const canScrollLeft  = scrollLeft > 0;
  const canScrollRight = scrollLeft < (colCount - 4) * STEP;
  const scrollBy = (dir: 1 | -1) =>
    setScrollLeft(s => Math.max(0, Math.min((colCount - 4) * STEP, s + dir * STEP * 4)));

  const visibleColStart = Math.round(scrollLeft / STEP);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col" style={{ background: '#0a0a12' }}>

      {/* ── Scene launch bar (top, like Resolume column buttons) ──────── */}
      <div className="flex items-center shrink-0 gap-1 px-2"
        style={{ height: 28, borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#080810' }}>
        {/* Scroll arrows */}
        <button onClick={() => scrollBy(-1)} disabled={!canScrollLeft}
          className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-white disabled:opacity-20 transition-all">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Scene launch buttons (one per visible column) */}
        <div className="flex-1 flex gap-1 overflow-hidden" style={{ marginLeft: 96 }}>
          {Array.from({ length: 4 }, (_, ci) => {
            const absCol = visibleColStart + ci;
            const anyActive = layers.some(l => l.activeCol === absCol && !l.bypassed && !l.muted);
            return (
              <button
                key={ci}
                onClick={() => launchScene(absCol)}
                className="flex-shrink-0 flex items-center justify-center text-[8px] font-black uppercase tracking-widest rounded transition-all"
                style={{
                  width: CELL_W, height: 20,
                  background: anyActive ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.04)',
                  border: anyActive ? '1px solid #8b5cf6' : '1px solid rgba(255,255,255,0.08)',
                  color: anyActive ? '#c084fc' : 'rgba(255,255,255,0.25)',
                }}
                title={`Launch scene ${absCol + 1} across all layers (MIDI P${ci * 3 + 13})`}
              >
                ▶ SCENE {absCol + 1}
              </button>
            );
          })}
        </div>

        {/* Scroll arrows right */}
        <button onClick={() => scrollBy(1)} disabled={!canScrollRight}
          className="w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-white disabled:opacity-20 transition-all">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* MIDI indicator */}
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          <Radio className={`w-3 h-3 ${midiActive ? 'text-green-400' : 'text-white/15'}`} />
          <span className="text-[7px] font-mono" style={{ color: midiActive ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.12)' }}>
            {midiActive ? 'MIDI' : 'P1-P12 · ROW=LAYER · COL=CLIP'}
          </span>
        </div>
      </div>

      {/* ── Layer rows (rendered bottom-up, so index 0 = Layer 1 = BG) ─── */}
      <div className="flex flex-col-reverse" style={{ flex: '0 0 auto' }}>
        {layers.map((layer, li) => (
          <div key={layer.id}
            style={{ borderTop: li > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}
            onDragOver={e => e.preventDefault()}
          >
            <LayerRow
              layer={layer}
              layerIdx={li}
              scrollLeft={scrollLeft}
              flashedPads={flashedPads}
              onUpdateLayer={patch => updateLayer(li, patch)}
              onFireClip={ci => fireClip(li, ci)}
              onDropMedia={(ci, f) => dropMedia(li, ci, f)}
              onAssignClip={(ci, clip) => assignClip(li, ci, clip)}
            />
          </div>
        ))}
      </div>

      {/* ── Source browser ─────────────────────────────────────────────── */}
      <SourceBrowser
        milkdropControls={milkdropForBrowser}
        onAssignToLayer={assignClip}
        layers={layers}
        config={config}
      />
    </div>
  );
};

export default ClipLauncher;
