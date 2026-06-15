// ClipGrid — Resolume-style clip launcher.
//
// Architecture:
//   4 columns = 4 compositing layers (BG → VIZ → PAL → FX)
//   4 rows per column = 4 clip slots per layer
//   MIDI column-major: padIdx = note-60, col = padIdx%4, row = padIdx>>2
//   Clicking a cell activates that clip in its layer.
//
// Layer routing:
//   BG  → onSetBgMedia (bgMedia1 in parent)
//   VIZ → onApply({ mode })
//   PAL → onApply({ colorPalette })
//   FX  → milkdrop controls / onApply toggle keys

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Wind, SkipBack, SkipForward, Shuffle, Radio, Play } from 'lucide-react';
import { VisualizationConfig, VisualizerMode, BackgroundMedia } from '../types';
import { MidiEventData, rotatePalette } from '../services/midiService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClipKind = 'empty' | 'scene' | 'palette' | 'fx' | 'media';

export interface ClipSlot {
  kind:          ClipKind;
  name:          string;
  color:         string;
  // scene
  sceneMode?:    string;
  // palette
  paletteColors?: string[];
  // fx
  fxKey?:        string; // 'milkdrop' | 'glitch' | 'bassShake' | 'paletteRotate' | 'milkdropNext'
  // media
  mediaUrl?:     string;
  mediaType?:    'video' | 'image';
  loop?:         boolean;
}

export interface MilkdropControls {
  enabled: boolean;
  name:    string;
  count:   number;
  onToggle:  () => void;
  onPrev:    () => void;
  onNext:    () => void;
  onRandom:  () => void;
}

// ─── Default clip matrix (4 cols × 4 rows) ───────────────────────────────────

const DEFAULT_MATRIX: ClipSlot[][] = [
  // ── Col 0: BG (background media / scene) ──────────────────────────────────
  [
    { kind: 'empty', name: 'Drop media', color: '#1e1e2e' },
    { kind: 'empty', name: 'Drop media', color: '#1e1e2e' },
    { kind: 'empty', name: 'Drop media', color: '#1e1e2e' },
    { kind: 'empty', name: 'Drop media', color: '#1e1e2e' },
  ],
  // ── Col 1: VIZ (audio visualizer scenes) ──────────────────────────────────
  [
    { kind: 'scene', name: 'SPECTRUM',   color: '#8b5cf6', sceneMode: 'SPECTRUM'     },
    { kind: 'scene', name: 'WAVEFORM',   color: '#6366f1', sceneMode: 'WAVEFORM'     },
    { kind: 'scene', name: 'PARTICLES',  color: '#0ea5e9', sceneMode: 'PARTICLES'    },
    { kind: 'scene', name: 'NEBULA',     color: '#ec4899', sceneMode: 'NEBULA'       },
  ],
  // ── Col 2: PAL (color palettes) ───────────────────────────────────────────
  [
    { kind: 'palette', name: 'NEON',     color: '#FF00CC', paletteColors: ['#FF00CC','#3333FF','#00CCFF','#FFFFFF'] },
    { kind: 'palette', name: 'SUNSET',   color: '#FF8C00', paletteColors: ['#FF8C00','#FF2D95','#7A1FA2','#FFE08A'] },
    { kind: 'palette', name: 'CYBER',    color: '#00FFC6', paletteColors: ['#00FFC6','#0066FF','#B500FF','#001018'] },
    { kind: 'palette', name: 'FIRE',     color: '#FFE070', paletteColors: ['#FFE070','#FF7A00','#E0245E','#3A0000'] },
  ],
  // ── Col 3: FX (effect toggles) ────────────────────────────────────────────
  [
    { kind: 'fx', name: 'MILKDROP',    color: '#c084fc', fxKey: 'milkdrop'       },
    { kind: 'fx', name: 'GLITCH',      color: '#22d3ee', fxKey: 'glitch'         },
    { kind: 'fx', name: 'BASS↑',       color: '#ef4444', fxKey: 'bassShake'      },
    { kind: 'fx', name: 'PALETTE→',    color: '#fbbf24', fxKey: 'paletteRotate'  },
  ],
];

const COLUMN_META = [
  { label: 'BG',  blendLabel: 'NORMAL', color: '#6366f1', desc: 'Background media layer' },
  { label: 'VIZ', blendLabel: 'ADD',    color: '#8b5cf6', desc: 'Audio visualizer scene'  },
  { label: 'PAL', blendLabel: 'SCREEN', color: '#ec4899', desc: 'Color palette'            },
  { label: 'FX',  blendLabel: 'SCREEN', color: '#06b6d4', desc: 'Effect overlays'          },
];

const MATRIX_KEY = 'plajah-clip-matrix-v2';

function loadMatrix(): ClipSlot[][] {
  try {
    const raw = sessionStorage.getItem(MATRIX_KEY);
    if (!raw) return DEFAULT_MATRIX.map(col => col.map(s => ({ ...s })));
    const saved = JSON.parse(raw) as ClipSlot[][];
    // Restore defaults for slots that are missing (e.g. after code update)
    return saved.map((col, ci) =>
      col.map((slot, ri) => slot || DEFAULT_MATRIX[ci]?.[ri] || { kind: 'empty', name: 'Drop media', color: '#1e1e2e' })
    );
  } catch {
    return DEFAULT_MATRIX.map(col => col.map(s => ({ ...s })));
  }
}
function saveMatrix(m: ClipSlot[][]) {
  try { sessionStorage.setItem(MATRIX_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  config:         VisualizationConfig;
  onApply:        (patch: Partial<VisualizationConfig>) => void;
  milkdrop?:      MilkdropControls;
  onSetBgMedia?:  (media: BackgroundMedia | null) => void;
  bottomLayout?:  boolean;
}

// ─── Resolume-style clip cell ─────────────────────────────────────────────────

interface CellProps {
  slot:      ClipSlot;
  colIdx:    number;
  rowIdx:    number;
  active:    boolean;
  flash:     boolean;
  onActivate: () => void;
  onDrop:    (file: File) => void;
}

const ClipCell: React.FC<CellProps> = ({ slot, colIdx, rowIdx, active, flash, onActivate, onDrop }) => {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const padNum = rowIdx * 4 + colIdx; // 0–15

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('image/'))) {
      onDrop(file);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onDrop(file);
  };

  // Cell background based on slot kind + state
  let bg = '#0c0c18';
  let borderColor = 'rgba(255,255,255,0.07)';
  let textColor = 'rgba(255,255,255,0.4)';

  if (flash) {
    bg = '#ffffff';
    borderColor = '#ffffff';
    textColor = '#000000';
  } else if (active) {
    bg = `${slot.color}33`;
    borderColor = `${slot.color}cc`;
    textColor = '#ffffff';
  } else if (dragOver) {
    bg = `${slot.color}22`;
    borderColor = slot.color;
  } else if (slot.kind === 'palette' && slot.paletteColors) {
    bg = '#0c0c18';
  }

  return (
    <div
      onClick={slot.kind === 'empty' ? () => fileRef.current?.click() : onActivate}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex flex-col justify-between cursor-pointer overflow-hidden select-none transition-all"
      style={{
        borderRadius: 3,
        border: `1px solid ${borderColor}`,
        background: bg,
        transform: flash ? 'scale(0.9)' : 'scale(1)',
        boxShadow: flash
          ? `0 0 0 2px rgba(255,255,255,0.7), 0 0 20px ${slot.color}`
          : active
            ? `0 0 0 1px ${slot.color}66, 0 0 14px ${slot.color}44`
            : 'none',
        minHeight: 0,
      }}
    >
      {/* Colored left stripe — Resolume signature */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{
          width: 3,
          background: flash ? '#fff' : active ? slot.color : `${slot.color}55`,
        }}
      />

      {/* Palette swatch background */}
      {slot.kind === 'palette' && slot.paletteColors && (
        <div className="absolute inset-0 flex opacity-25">
          {slot.paletteColors.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
        </div>
      )}

      {/* Media thumbnail */}
      {slot.kind === 'media' && slot.mediaUrl && (
        <div className="absolute inset-0 overflow-hidden">
          {slot.mediaType === 'video' ? (
            <video
              src={slot.mediaUrl}
              className="w-full h-full object-cover opacity-40"
              muted autoPlay loop playsInline
            />
          ) : (
            <img src={slot.mediaUrl} className="w-full h-full object-cover opacity-40" alt="" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full justify-between p-1.5 pl-2.5">
        {/* Top: pad number */}
        <div className="flex items-center justify-between">
          <span
            className="text-[7px] font-black font-mono leading-none"
            style={{ color: flash ? '#000' : active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)' }}
          >
            P{padNum + 1}
          </span>
          {/* Play indicator */}
          {active && !flash && (
            <Play className="w-2 h-2 fill-current" style={{ color: slot.color }} />
          )}
        </div>

        {/* Bottom: clip name */}
        <div>
          {slot.kind === 'empty' ? (
            <div className="flex flex-col items-center justify-center gap-0.5 py-1">
              <Upload className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
              <span className="text-[7px]" style={{ color: 'rgba(255,255,255,0.2)' }}>DRAG / CLICK</span>
            </div>
          ) : (
            <>
              <div
                className="text-[10px] font-black leading-tight uppercase tracking-wide truncate"
                style={{ color: flash ? '#000' : textColor === '#ffffff' ? '#fff' : textColor }}
              >
                {slot.name}
              </div>
              <div
                className="text-[7px] uppercase tracking-widest leading-none mt-0.5"
                style={{ color: flash ? '#333' : active ? `${slot.color}cc` : 'rgba(255,255,255,0.18)' }}
              >
                {slot.kind === 'scene'   ? 'SCENE'   :
                 slot.kind === 'palette' ? 'PALETTE' :
                 slot.kind === 'fx'      ? 'FX'      :
                 slot.kind === 'media'   ? (slot.mediaType?.toUpperCase() ?? 'MEDIA') : ''}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

// ─── ClipGrid ─────────────────────────────────────────────────────────────────

const ClipGrid: React.FC<Props> = ({
  config, onApply, milkdrop, onSetBgMedia, bottomLayout,
}) => {
  const [matrix,     setMatrix]     = useState<ClipSlot[][]>(() => loadMatrix());
  const [activeRows, setActiveRows] = useState<(number | null)[]>([null, null, null, null]);
  const [flashedPad, setFlashedPad] = useState<number | null>(null);
  const [midiActive, setMidiActive] = useState(false);
  const midiTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef   = useRef(config);
  const milkdropRef = useRef(milkdrop);
  useEffect(() => { configRef.current   = config;   }, [config]);
  useEffect(() => { milkdropRef.current = milkdrop; }, [milkdrop]);

  // ── Fire a clip by col + row ────────────────────────────────────────────────
  const fireClip = useCallback((col: number, row: number, mat?: ClipSlot[][]) => {
    const m = mat ?? matrix;
    const slot = m[col]?.[row];
    if (!slot) return;

    setActiveRows(prev => {
      const next = [...prev];
      next[col] = next[col] === row ? null : row; // toggle if already active
      return next;
    });

    if (slot.kind === 'scene' && slot.sceneMode) {
      onApply({ mode: slot.sceneMode as VisualizerMode });
    } else if (slot.kind === 'palette' && slot.paletteColors) {
      onApply({ colorPalette: [...slot.paletteColors] });
    } else if (slot.kind === 'fx') {
      const md = milkdropRef.current;
      switch (slot.fxKey) {
        case 'milkdrop':       md?.onToggle();      break;
        case 'milkdropNext':   md?.onNext();        break;
        case 'glitch':         onApply({ enableGlitch: !(configRef.current as any).enableGlitch }); break;
        case 'bassShake':      onApply({ enableBassShake: !(configRef.current as any).enableBassShake }); break;
        case 'paletteRotate':  onApply({ colorPalette: rotatePalette(configRef.current.colorPalette) }); break;
      }
    } else if (slot.kind === 'media' && slot.mediaUrl) {
      onSetBgMedia?.({ url: slot.mediaUrl, type: slot.mediaType ?? 'video', id: `clip-${col}-${row}` });
    } else if (slot.kind === 'empty') {
      // handled by ClipCell (opens file picker)
    }
  }, [matrix, onApply, onSetBgMedia]);

  // ── MIDI pad → clip fire (column-major: col = padIdx%4, row = padIdx>>2) ───
  useEffect(() => {
    const handleNoteOn = (e: Event) => {
      const d = (e as CustomEvent).detail as MidiEventData;
      if (!d) return;
      const note = d.note;
      if (note < 60 || note > 75) return;
      const padIdx = note - 60;
      const col = padIdx % 4;
      const row = padIdx >> 2;

      setFlashedPad(padIdx);
      if (midiTimerRef.current) clearTimeout(midiTimerRef.current);
      midiTimerRef.current = setTimeout(() => setFlashedPad(null), 180);

      setMidiActive(true);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      activeTimerRef.current = setTimeout(() => setMidiActive(false), 800);

      fireClip(col, row);
    };

    window.addEventListener('plajah-midi-note-on', handleNoteOn);
    return () => {
      window.removeEventListener('plajah-midi-note-on', handleNoteOn);
      if (midiTimerRef.current)   clearTimeout(midiTimerRef.current);
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    };
  }, [fireClip]);

  // ── Assign media file to a cell ─────────────────────────────────────────────
  const assignMedia = (col: number, row: number, file: File) => {
    const url = URL.createObjectURL(file);
    const mediaType: 'video' | 'image' = file.type.startsWith('video/') ? 'video' : 'image';
    const newSlot: ClipSlot = {
      kind: 'media',
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 14).toUpperCase(),
      color: '#6366f1',
      mediaUrl: url,
      mediaType,
      loop: true,
    };
    const updated: ClipSlot[][] = matrix.map((c, ci) =>
      c.map((s, ri) => (ci === col && ri === row ? newSlot : s))
    );
    setMatrix(updated);
    saveMatrix(updated);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isPadFlashed = (col: number, row: number) => {
    if (flashedPad === null) return false;
    return flashedPad % 4 === col && flashedPad >> 2 === row;
  };

  const isPaletteActive = (slot: ClipSlot) =>
    slot.kind === 'palette' && slot.paletteColors &&
    JSON.stringify(config.colorPalette) === JSON.stringify(slot.paletteColors);

  const isFxActive = (slot: ClipSlot) => {
    if (slot.kind !== 'fx') return false;
    const c = config as any;
    switch (slot.fxKey) {
      case 'milkdrop':  return !!milkdrop?.enabled;
      case 'glitch':    return !!c.enableGlitch;
      case 'bassShake': return !!c.enableBassShake;
      default:          return false;
    }
  };

  const isSlotActive = (slot: ClipSlot, col: number, row: number): boolean => {
    if (slot.kind === 'scene')   return config.mode === slot.sceneMode;
    if (slot.kind === 'palette') return isPaletteActive(slot);
    if (slot.kind === 'fx')      return isFxActive(slot);
    if (slot.kind === 'media')   return activeRows[col] === row;
    return false;
  };

  // ── Bottom / Resolume layout ─────────────────────────────────────────────────
  if (bottomLayout) {
    return (
      <div className="w-full h-full flex flex-col" style={{ padding: '0 8px 8px 8px' }}>

        {/* MIDI status row */}
        <div className="flex items-center justify-between py-1 px-1 shrink-0">
          <div className="flex items-center gap-1.5">
            <Radio className={`w-3 h-3 ${midiActive ? 'text-green-400' : 'text-white/15'}`} />
            <span className="text-[8px] font-mono" style={{ color: midiActive ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.15)' }}>
              {midiActive ? 'MIDI FIRED' : 'P1–P16 MAPPED  ·  COL = LAYER  ·  ROW = CLIP'}
            </span>
          </div>
        </div>

        {/* 4-column grid */}
        <div className="flex-1 grid gap-1.5 min-h-0" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {COLUMN_META.map((col, ci) => (
            <div key={col.label} className="flex flex-col gap-1 min-h-0">

              {/* Column header */}
              <div
                className="flex items-center justify-between px-2 py-1 rounded-sm shrink-0"
                style={{ background: `${col.color}18`, borderBottom: `1px solid ${col.color}44` }}
              >
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: col.color }}>
                  {col.label}
                </span>
                <span
                  className="text-[7px] font-mono px-1 rounded"
                  style={{ background: `${col.color}22`, color: `${col.color}99`, border: `1px solid ${col.color}33` }}
                >
                  {col.blendLabel}
                </span>
              </div>

              {/* Clip cells (rows) */}
              <div className="flex-1 grid gap-1 min-h-0" style={{ gridTemplateRows: 'repeat(4, 1fr)' }}>
                {matrix[ci]?.map((slot, ri) => (
                  <ClipCell
                    key={ri}
                    slot={slot}
                    colIdx={ci}
                    rowIdx={ri}
                    active={isSlotActive(slot, ci, ri)}
                    flash={isPadFlashed(ci, ri)}
                    onActivate={() => fireClip(ci, ri)}
                    onDrop={file => assignMedia(ci, ri, file)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Milkdrop transport (shown when Milkdrop FX is active) */}
        {milkdrop?.enabled && (
          <div className="flex items-center gap-2 pt-1 px-1 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <Wind className="w-3 h-3 text-purple-400" />
            <span className="text-[8px] font-mono text-white/30 flex-1 truncate">{milkdrop.name || 'Milkdrop'}</span>
            <button onClick={milkdrop.onPrev}   className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-colors"><SkipBack    className="w-3 h-3" /></button>
            <button onClick={milkdrop.onRandom} className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-colors"><Shuffle     className="w-3 h-3" /></button>
            <button onClick={milkdrop.onNext}   className="w-6 h-6 flex items-center justify-center text-white/30 hover:text-white transition-colors"><SkipForward className="w-3 h-3" /></button>
          </div>
        )}
      </div>
    );
  }

  // ── Compact sidebar / floating layout (non-bottom) ────────────────────────
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/5 shrink-0">
        <Radio className={`w-3 h-3 shrink-0 ${midiActive ? 'text-green-400' : 'text-white/20'}`} />
        <span className="text-[9px] font-mono text-white/30">
          {midiActive ? 'MIDI clip fired' : 'Col-major MIDI: P1/P5/P9/P13=BG · P2/P6/P10/P14=VIZ'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-none p-2">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 48px)' }}>
          {matrix.map((col, ci) =>
            col.map((slot, ri) => (
              <ClipCell
                key={`${ci}-${ri}`}
                slot={slot}
                colIdx={ci}
                rowIdx={ri}
                active={isSlotActive(slot, ci, ri)}
                flash={isPadFlashed(ci, ri)}
                onActivate={() => fireClip(ci, ri)}
                onDrop={file => assignMedia(ci, ri, file)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ClipGrid;
