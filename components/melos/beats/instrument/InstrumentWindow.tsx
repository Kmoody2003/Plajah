// The ONE window every instrument opens in — floating, draggable by its title bar, resizable
// from the corner grip, remembering its geometry per instrument type. The title bar is the
// common chrome the panels never agreed on: instrument identity, track name (double-click to
// rename), the preset dropdown with prev/next and user-preset save/manage, Arm, and Close.
// The panel bodies render inside as children (with their own deep editors overlaying the window).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Circle, Save, Trash2 } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { instrumentLabel, instrumentColor } from '../../../../services/melos/beats/instrumentFactory';
import {
  listPresets, applyPresetToDoc, pushTrackPatch, saveUserPreset, deleteUserPreset, type PresetEntry,
} from '../../../../services/melos/beats/presetHub';
import { ARMED, SURFACE } from '../theme';

interface Geometry { x: number; y: number; w: number; h: number }

const GEO_KEY = 'melos.instrumentWindow.v1';

const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  onda: { w: 1040, h: 700 },
  kera: { w: 900, h: 660 },
  bajo: { w: 780, h: 640 },
  vela: { w: 720, h: 620 },
  cantus: { w: 720, h: 620 },
  ison: { w: 720, h: 620 },
  pneuma: { w: 720, h: 620 },
};

function loadGeo(type: InstrumentType): Geometry | null {
  try {
    const all = JSON.parse(localStorage.getItem(GEO_KEY) || '{}') as Record<string, Geometry>;
    return all[type] ?? null;
  } catch { return null; }
}
function saveGeo(type: InstrumentType, g: Geometry): void {
  try {
    const all = JSON.parse(localStorage.getItem(GEO_KEY) || '{}') as Record<string, Geometry>;
    all[type] = g;
    localStorage.setItem(GEO_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export const InstrumentWindow: React.FC<Props> = ({ doc, track, onMutate, onClose, children }) => {
  const type = (track.instrument?.type ?? 'onda') as InstrumentType;
  const accent = instrumentColor(type);
  const label = instrumentLabel(type);

  const [geo, setGeo] = useState<Geometry>(() => {
    const saved = loadGeo(type);
    if (saved) return saved;
    const d = DEFAULT_SIZE[type] ?? { w: 900, h: 660 };
    const w = Math.min(d.w, window.innerWidth - 48);
    const h = Math.min(d.h, window.innerHeight - 96);
    return { x: Math.max(12, (window.innerWidth - w) / 2), y: Math.max(56, (window.innerHeight - h) / 2 - 16), w, h };
  });
  const geoRef = useRef(geo);
  geoRef.current = geo;
  useEffect(() => () => saveGeo(type, geoRef.current), [type]);

  const clamp = (g: Geometry): Geometry => ({
    w: Math.max(420, Math.min(g.w, window.innerWidth - 16)),
    h: Math.max(320, Math.min(g.h, window.innerHeight - 24)),
    x: Math.max(-g.w + 120, Math.min(g.x, window.innerWidth - 120)),
    y: Math.max(0, Math.min(g.y, window.innerHeight - 48)),
  });

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    // Buttons/inputs in the title bar keep their own gestures.
    if (mode === 'move' && (e.target as HTMLElement).closest('button, input, select')) return;
    e.preventDefault();
    const start = { ...geoRef.current };
    const sx = e.clientX; const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx; const dy = ev.clientY - sy;
      setGeo(clamp(mode === 'move'
        ? { ...start, x: start.x + dx, y: start.y + dy }
        : { ...start, w: start.w + dx, h: start.h + dy }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveGeo(type, geoRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── Rename (double-click the title) ──
  const [renaming, setRenaming] = useState(false);
  const [nameText, setNameText] = useState(track.name);
  const commitRename = () => {
    setRenaming(false);
    const name = nameText.trim();
    if (!name || name === track.name) return;
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t) return;
      t.name = name;
      const pad = d.kit.find((p) => p.instrumentTrackId === track.id);
      if (pad) pad.name = name.slice(0, 18);
    });
  };

  // ── Presets ──
  const presets = listPresets(type);
  const currentIdx = presets.findIndex((p) => p.name === track.instrument?.presetName);
  const applyPreset = useCallback((presetId: string) => {
    let ok = false;
    onMutate((d) => { ok = applyPresetToDoc(d, track.id, presetId); });
    if (ok) pushTrackPatch(track.id);
  }, [onMutate, track.id]);
  const stepPreset = (dir: 1 | -1) => {
    if (!presets.length) return;
    const next = presets[(currentIdx + dir + presets.length) % presets.length];
    applyPreset(next.id);
  };
  const [manageOpen, setManageOpen] = useState(false);
  const [, forceRender] = useState(0);
  const savePreset = () => {
    const name = window.prompt('Save current sound as…', track.instrument?.presetName || track.name);
    if (!name) return;
    saveUserPreset(type, name, track);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (t?.instrument) t.instrument.presetName = name.trim().slice(0, 40);
    });
  };
  const removePreset = (p: PresetEntry) => {
    deleteUserPreset(type, p.id);
    forceRender((n) => n + 1);
  };

  const toggleArm = () => onMutate((d) => {
    const on = !track.armed;
    for (const t of d.arrangement) t.armed = false;
    const t = d.arrangement.find((x) => x.id === track.id);
    if (t) t.armed = on;
  });

  return (
    <div
      className="fixed z-[70] flex flex-col rounded-[16px] border border-white/[0.18] shadow-[0_28px_70px_-18px_rgba(0,0,0,0.85)] overflow-hidden"
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h, background: SURFACE }}
      role="dialog"
      aria-label={`${label} — ${track.name}`}
    >
      {/* title bar — the common chrome */}
      <div
        className="flex items-center gap-2 px-3 h-10 flex-none border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
        style={{ background: '#101014' }}
        onPointerDown={startDrag('move')}
      >
        <span className="w-2 h-2 rounded-full flex-none" style={{ background: accent, boxShadow: `0 0 8px ${accent}88` }} />
        <span className="font-black text-[10px] tracking-[0.16em] flex-none" style={{ color: accent }}>{label}</span>
        {renaming ? (
          <input
            autoFocus
            value={nameText}
            onChange={(e) => setNameText(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            className="h-6 px-1.5 w-40 rounded bg-black/40 border border-white/25 text-[11.5px] text-white outline-none"
            aria-label="Track name"
          />
        ) : (
          <span
            className="text-[11.5px] font-semibold text-white/85 truncate max-w-[180px]"
            onDoubleClick={() => { setNameText(track.name); setRenaming(true); }}
            title="Double-click to rename this track"
          >{track.name}</span>
        )}

        <span className="flex-1" />

        {/* preset dropdown + prev/next + manage */}
        {presets.length > 0 && (
          <div className="flex items-center gap-0.5 rounded-lg border border-white/12 bg-black/30 pl-0.5 pr-0.5 h-7">
            <button onClick={() => stepPreset(-1)} className="w-5 h-6 grid place-items-center text-white/40 hover:text-white" aria-label="Previous preset"><ChevronLeft size={12} /></button>
            <select
              value={currentIdx >= 0 ? presets[currentIdx].id : ''}
              onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
              className="h-6 max-w-[190px] bg-transparent text-[11px] text-white outline-none cursor-pointer"
              aria-label="Preset"
              title="Choose a preset"
            >
              <option value="" disabled hidden>{track.instrument?.presetName || 'Presets…'}</option>
              {presets.some((p) => !p.user) && (
                <optgroup label="Factory">
                  {presets.filter((p) => !p.user).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.category ? ` · ${p.category}` : ''}</option>
                  ))}
                </optgroup>
              )}
              {presets.some((p) => p.user) && (
                <optgroup label="My presets">
                  {presets.filter((p) => p.user).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              )}
            </select>
            <button onClick={() => stepPreset(1)} className="w-5 h-6 grid place-items-center text-white/40 hover:text-white" aria-label="Next preset"><ChevronRight size={12} /></button>
          </div>
        )}
        <button
          onClick={savePreset}
          className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"
          title="Save the current sound as a preset"
          aria-label="Save preset"
        ><Save size={12} /></button>
        {presets.some((p) => p.user) && (
          <button
            onClick={() => setManageOpen((v) => !v)}
            className={`h-7 px-1.5 grid place-items-center rounded-lg border text-[9px] uppercase tracking-wide ${managOpenCls(manageOpen)}`}
            title="Manage my presets"
          >Mine</button>
        )}

        <button
          onClick={toggleArm}
          className="h-7 px-2 rounded-lg border flex items-center gap-1 text-[10px]"
          style={track.armed
            ? { borderColor: ARMED, color: ARMED, background: 'rgba(255,140,0,0.12)' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
          title={track.armed ? 'Armed — your keyboard and MIDI play this' : 'Arm for playing and recording'}
        ><Circle size={7} fill="currentColor" /> {track.armed ? 'Armed' : 'Arm'}</button>

        <button onClick={onClose} aria-label="Close instrument" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white hover:bg-white/10">
          <X size={13} />
        </button>
      </div>

      {/* user-preset manager drawer */}
      {manageOpen && (
        <div className="flex-none border-b border-white/10 bg-black/30 px-3 py-2 max-h-36 overflow-y-auto">
          <p className="text-[9px] uppercase tracking-[0.16em] text-white/30 font-semibold mb-1">My presets</p>
          {listPresets(type).filter((p) => p.user).map((p) => (
            <div key={p.id} className="flex items-center gap-2 h-7">
              <button onClick={() => applyPreset(p.id)} className="flex-1 text-left text-[11px] text-white/70 hover:text-white truncate">{p.name}</button>
              <button onClick={() => removePreset(p)} className="w-6 h-6 grid place-items-center rounded text-white/25 hover:text-[#EF4444]" aria-label={`Delete preset ${p.name}`}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* panel body — the instrument's own play surface. `relative` so deep editors that
          position absolute inset-0 fill the window, not the page. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {children}
      </div>

      {/* resize grip */}
      <div
        onPointerDown={startDrag('resize')}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.22) 50%)' }}
        aria-label="Resize window"
      />
    </div>
  );
};

function managOpenCls(open: boolean): string {
  return open ? 'border-white/30 text-white bg-white/10' : 'border-white/10 text-white/40 hover:text-white';
}
