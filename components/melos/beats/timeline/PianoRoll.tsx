// The piano roll — the instrument-track note & MPE orchestral expression editor.
//
// One note list, two editors: this and the step grid render the SAME `clip.notes`, so switching
// between them is a view change, never a conversion. Notes may sit off-grid here; the scheduler
// fires them at their exact time, and the step grid simply shows them snapped.
//
// Upgraded for Chora Studio Symphonic Film Scoring:
//   - Per-note MPE expression curves (`pressure` / CC11 swell, `timbre` / CC74 brightness, `bend` / glide, `vibratoDepth`)
//   - Orchestral articulations (`legato`, `spiccato`, `marcato`, `tremolo`, `pizzicato`, `con-sordino`, `sul-ponticello`, `portamento`, `sfz-hairpin`)
//   - Interactive bottom Expression & Velocity Lane Drawer + Composer Expression Macros (Hairpin Swell, Legato Overlap, Humanize Rubato)

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Grid3x3, Music4, Sparkles, Sliders, Trash2, Wand2 } from 'lucide-react';
import type {
  GrooveDoc,
  MpeSwellShape,
  NoteEvent,
  OrchestralArticulation,
  TimelineClip,
} from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD, SELECT } from '../theme';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const ROW_H = 15;
const KEY_W = 46;
const LOW = 24;  // C1
const HIGH = 96; // C7
const ROWS = HIGH - LOW + 1;

const noteName = (k: number) => `${NOTE_NAMES[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}`;

type EditMode = 'roll' | 'steps';
type ExpressionLaneKind = 'velocity' | 'pressure' | 'timbre' | 'bend' | 'vibrato';

const ARTICULATION_SPECS: Array<{ id: OrchestralArticulation; label: string; short: string; color: string }> = [
  { id: 'legato', label: 'Legato Cantabile', short: 'LEG', color: '#38BDF8' },
  { id: 'spiccato', label: 'Spiccato Short Bow', short: 'SPIC', color: '#FBBF24' },
  { id: 'marcato', label: 'Marcato Accent', short: 'MARC', color: '#F87171' },
  { id: 'tremolo', label: 'Bow Tremolo (11.5 Hz)', short: 'TREM', color: '#A78BFA' },
  { id: 'pizzicato', label: 'Pizzicato Pluck', short: 'PIZZ', color: '#34D399' },
  { id: 'sfz-hairpin', label: 'Sforzando Hairpin (< >)', short: 'SFZ', color: '#FB923C' },
  { id: 'portamento', label: 'Portamento Glide', short: 'PORT', color: '#F472B6' },
  { id: 'con-sordino', label: 'Con Sordino (Muted)', short: 'SORD', color: '#94A3B8' },
  { id: 'sul-ponticello', label: 'Sul Ponticello (Glassy)', short: 'PONT', color: '#2DD4BF' },
];

const SWELL_SHAPES: Array<{ id: MpeSwellShape; label: string }> = [
  { id: 'hairpin', label: '⟨ ⟩ Hairpin Swell' },
  { id: 'crescendo', label: '⟨ Crescendo' },
  { id: 'decrescendo', label: '⟩ Decrescendo' },
  { id: 'sfz-swell', label: 'SFZ + Swell' },
  { id: 'arch', label: '⌒ Phrase Arch' },
  { id: 'sustained', label: '— Sustained' },
];

interface PianoRollProps {
  doc: GrooveDoc;
  trackId: string;
  clip: TimelineClip;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const PianoRoll: React.FC<PianoRollProps> = ({ doc, trackId, clip, beats, running, playMode, onMutate, onClose }) => {
  const [mode, setMode] = useState<EditMode>('roll');
  const [pxPerBeat, setPxPerBeat] = useState(64);
  const [snap, setSnap] = useState(0.25);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastLen, setLastLen] = useState(0.5);
  const [defaultArticulation, setDefaultArticulation] = useState<OrchestralArticulation>('legato');
  const [defaultSwell, setDefaultSwell] = useState<MpeSwellShape>('hairpin');
  const [exprLane, setExprLane] = useState<ExpressionLaneKind>('pressure');
  const [showExprDrawer, setShowExprDrawer] = useState(true);

  const drag = useRef<{ id: string; mode: 'move' | 'len'; x: number; y: number; start: number; len: number; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const track = doc.arrangement.find((t) => t.id === trackId);
  const notes = clip.notes || [];
  const selectedNote = useMemo(() => notes.find((n) => n.id === selected) || null, [notes, selected]);
  const width = Math.max(640, clip.lengthBeats * pxPerBeat);

  // Centre on the notes (or middle C) the first time this clip opens.
  const centred = useRef<string | null>(null);
  React.useEffect(() => {
    if (centred.current === clip.id || !scrollRef.current) return;
    centred.current = clip.id;
    const avg = notes.length ? notes.reduce((a, n) => a + n.key, 0) / notes.length : 60;
    scrollRef.current.scrollTop = Math.max(0, (HIGH - avg - 6) * ROW_H);
  }, [clip.id, notes]);

  const editNotes = useCallback((fn: (list: NoteEvent[]) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === trackId);
      const c = t?.clips.find((x) => x.id === clip.id);
      if (!c) return;
      if (!c.notes) c.notes = [];
      fn(c.notes);
    });
  }, [onMutate, trackId, clip.id]);

  const audition = useCallback((key: number, vel = 100) => {
    if (!track) return;
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then(() => {
      engine.instrumentNoteOn(track, key, vel);
      setTimeout(() => engine.instrumentNoteOff(track, key), 250);
    });
  }, [track]);

  const addNote = useCallback((key: number, startBeats: number) => {
    const snapped = Math.max(0, snap > 0 ? Math.round(startBeats / snap) * snap : startBeats);
    const id = grooveUid();
    editNotes((list) => {
      list.push({
        id,
        startBeats: snapped,
        lengthBeats: lastLen,
        key,
        vel: 100,
        articulation: defaultArticulation,
        expr: {
          pressure: 0.82,
          timbre: defaultArticulation === 'sul-ponticello' ? 0.88 : defaultArticulation === 'con-sordino' ? 0.35 : 0.68,
          bend: 0,
          swellShape: defaultSwell,
          vibratoDepth: lastLen >= 1.0 ? 0.18 : 0.06,
          vibratoRateHz: 5.4,
        },
      });
    });
    setSelected(id);
    audition(key);
  }, [editNotes, snap, lastLen, defaultArticulation, defaultSwell, audition]);

  const removeNote = useCallback((id: string) => {
    editNotes((list) => {
      const i = list.findIndex((n) => n.id === id);
      if (i >= 0) list.splice(i, 1);
    });
    if (selected === id) setSelected(null);
  }, [editNotes, selected]);

  // ── Composer Expression Macros ──────────────────────────────────────────────
  const applyHairpinSwells = useCallback(() => {
    editNotes((list) => {
      const targets = selected ? list.filter((n) => n.id === selected) : list;
      targets.forEach((n, idx) => {
        const isLong = n.lengthBeats >= 1.25;
        n.articulation = isLong ? 'legato' : (n.articulation || 'legato');
        n.expr = {
          ...(n.expr || {}),
          swellShape: isLong ? 'hairpin' : 'arch',
          pressure: Math.min(1, Math.max(0.55, (n.vel / 127) * 1.08)),
          timbre: Math.min(0.95, 0.58 + 0.25 * Math.sin((idx / Math.max(1, targets.length)) * Math.PI)),
          vibratoDepth: isLong ? 0.22 : 0.08,
          vibratoRateHz: 5.5,
          vibratoDelay01: 0.2,
        };
      });
    });
  }, [editNotes, selected]);

  const applyLegatoPortamento = useCallback(() => {
    editNotes((list) => {
      const sorted = [...list].sort((a, b) => a.startBeats - b.startBeats);
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];
        if (next && next.startBeats > cur.startBeats) {
          const gap = next.startBeats - (cur.startBeats + cur.lengthBeats);
          if (gap >= -0.15 && gap <= 0.5) {
            // Slight 0.06-beat overlap for true legato phrasing
            cur.lengthBeats = Math.max(0.15, next.startBeats - cur.startBeats + 0.06);
            const interval = cur.key - next.key;
            if (Math.abs(interval) >= 1 && Math.abs(interval) <= 7) {
              next.articulation = 'portamento';
              next.expr = {
                ...(next.expr || {}),
                glideFromSemis: Math.sign(interval) * Math.min(2, Math.abs(interval) * 0.5),
                glidePortion01: 0.22,
                swellShape: next.expr?.swellShape || 'hairpin',
              };
            }
          }
        }
      }
    });
  }, [editNotes]);

  const applyHumanizeRubato = useCallback(() => {
    editNotes((list) => {
      list.forEach((n, i) => {
        const phase = (i * 1.6180339) % 1;
        const velDelta = Math.round(Math.sin(i * 0.85) * 9 + (phase - 0.5) * 6);
        n.vel = Math.max(28, Math.min(126, n.vel + velDelta));
        const microBeat = (Math.sin(i * 1.37) * 0.018);
        n.startBeats = Math.max(0, Number((n.startBeats + microBeat).toFixed(4)));
        n.expr = {
          ...(n.expr || {}),
          pressure: Math.max(0.3, Math.min(1, (n.vel / 127) * (0.92 + 0.14 * Math.sin(i * 0.6)))),
          timbre: Math.max(0.25, Math.min(0.95, 0.55 + 0.24 * Math.cos(i * 0.45))),
          vibratoDepth: n.lengthBeats >= 1.5 ? 0.19 : 0.07,
          swellShape: n.expr?.swellShape || (n.lengthBeats >= 2 ? 'hairpin' : 'arch'),
        };
      });
    });
  }, [editNotes]);

  const updateSelectedArticulation = useCallback((art: OrchestralArticulation) => {
    setDefaultArticulation(art);
    if (!selected) return;
    editNotes((list) => {
      const target = list.find((n) => n.id === selected);
      if (target) {
        target.articulation = art;
        target.expr = {
          ...(target.expr || {}),
          swellShape:
            art === 'sfz-hairpin'
              ? 'sfz-swell'
              : art === 'spiccato' || art === 'pizzicato'
                ? 'decrescendo'
                : target.expr?.swellShape || 'hairpin',
        };
      }
    });
  }, [selected, editNotes]);

  const updateSelectedSwell = useCallback((swell: MpeSwellShape) => {
    setDefaultSwell(swell);
    if (!selected) return;
    editNotes((list) => {
      const target = list.find((n) => n.id === selected);
      if (target) {
        target.expr = { ...(target.expr || {}), swellShape: swell };
      }
    });
  }, [selected, editNotes]);

  const playheadBeats = running && playMode === 'song' ? beats - clip.startBeats : -1;

  // ── step grid: the same notes on a 16th grid, one row per pitch actually in use ──
  const stepRows = useMemo(() => {
    const keys = [...new Set(notes.map((n) => n.key))].sort((a, b) => b - a);
    return keys.length ? keys : [60];
  }, [notes]);
  const stepCount = Math.max(16, Math.round(clip.lengthBeats * 4));

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#0A0A0D] flex flex-col" style={{ height: showExprDrawer ? '58%' : '46%' }}>
      {/* Top Toolbar: Mode, Snap, Articulation, MPE Swell & Composer Expression Macros */}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-white/10 flex-none overflow-x-auto">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/45 font-semibold whitespace-nowrap">
          {track?.name || 'Clip'}
        </span>
        <span className="text-[10px] text-white/25 whitespace-nowrap">{notes.length} notes</span>

        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 ml-1">
          <button onClick={() => setMode('roll')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'roll' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Music4 size={10} /> MPE Roll</button>
          <button onClick={() => setMode('steps')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'steps' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Grid3x3 size={10} /> Steps</button>
        </div>

        <label className="flex items-center gap-1 text-[10px] text-white/35 whitespace-nowrap">Snap
          <select value={snap} onChange={(e) => setSnap(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded px-1 h-6 text-[10px] text-white/75 outline-none">
            <option value={1}>1/4</option><option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option><option value={0.125}>1/32</option>
            <option value={0}>off (Rubato)</option>
          </select>
        </label>

        {/* Orchestral Articulation Selector */}
        <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap">Articulation
          <select
            value={selectedNote?.articulation || defaultArticulation}
            onChange={(e) => updateSelectedArticulation(e.target.value as OrchestralArticulation)}
            className="bg-black/50 border border-[#D0BCFF]/30 rounded px-1.5 h-6 text-[10px] text-[#D0BCFF] outline-none"
          >
            {ARTICULATION_SPECS.map((a) => (
              <option key={a.id} value={a.id}>{a.short} · {a.label}</option>
            ))}
          </select>
        </label>

        {/* MPE Dynamic Swell Shape Selector */}
        <label className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap">MPE Swell
          <select
            value={selectedNote?.expr?.swellShape || defaultSwell}
            onChange={(e) => updateSelectedSwell(e.target.value as MpeSwellShape)}
            className="bg-black/50 border border-[#38BDF8]/30 rounded px-1.5 h-6 text-[10px] text-[#38BDF8] outline-none"
          >
            {SWELL_SHAPES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        {/* Composer Expression Action Buttons */}
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={applyHairpinSwells}
            title="Apply continuous MPE pressure hairpin swells (< >) and progressive string/wind vibrato"
            className="h-6 px-2 rounded-md bg-[#38BDF8]/15 border border-[#38BDF8]/30 text-[#38BDF8] hover:bg-[#38BDF8]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            <Wand2 size={10} /> ⟨ ⟩ Hairpin Swell
          </button>
          <button
            onClick={applyLegatoPortamento}
            title="Overlap consecutive melody notes and add expressive legato portamento pitch glide"
            className="h-6 px-2 rounded-md bg-[#F472B6]/15 border border-[#F472B6]/30 text-[#F472B6] hover:bg-[#F472B6]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            ⌢ Legato + Glide
          </button>
          <button
            onClick={applyHumanizeRubato}
            title="Humanize note velocities, micro-timing rubato, and MPE timbre breath"
            className="h-6 px-2 rounded-md bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/25 text-[9.5px] font-medium whitespace-nowrap flex items-center gap-1"
          >
            <Sparkles size={10} /> Humanize Rubato
          </button>
        </div>

        {mode === 'roll' && (
          <label className="flex items-center gap-1 text-[10px] text-white/35 whitespace-nowrap ml-1">Zoom
            <input type="range" min={20} max={160} value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} className="w-16 accent-[#D0BCFF]" />
          </label>
        )}

        <span className="flex-1" />

        <button
          onClick={() => setShowExprDrawer((v) => !v)}
          className={`h-6 px-2 rounded-lg border text-[10px] flex items-center gap-1 whitespace-nowrap ${
            showExprDrawer ? 'border-[#D0BCFF]/40 bg-[#D0BCFF]/15 text-[#D0BCFF]' : 'border-white/10 text-white/45'
          }`}
        >
          <Sliders size={10} /> MPE Lanes
        </button>

        {selected && (
          <button onClick={() => removeNote(selected)} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-[#EF4444] text-[10px] flex items-center gap-1">
            <Trash2 size={10} /> Delete
          </button>
        )}
        <button onClick={onClose} className="h-6 px-2.5 rounded-lg border border-white/15 text-white/50 hover:text-white text-[10px]">Close</button>
      </div>

      {mode === 'roll' ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto flex flex-col">
          {/* Note Grid Area */}
          <div className="relative flex-none" style={{ width: KEY_W + width, height: ROWS * ROW_H }}>
            {/* keyboard + rows */}
            {Array.from({ length: ROWS }, (_, r) => {
              const key = HIGH - r;
              const black = BLACK.has(((key % 12) + 12) % 12);
              return (
                <div key={r} className="absolute left-0 right-0 flex" style={{ top: r * ROW_H, height: ROW_H }}>
                  <button
                    onPointerDown={() => audition(key)}
                    className="sticky left-0 z-10 flex-none flex items-center justify-end pr-1.5 text-[8px] font-mono border-b border-r"
                    style={{
                      width: KEY_W, height: ROW_H,
                      background: black ? '#15151A' : '#E8E4EE',
                      color: black ? 'rgba(255,255,255,0.45)' : '#0A0A0D',
                      borderColor: 'rgba(0,0,0,0.5)',
                    }}
                  >{key % 12 === 0 ? noteName(key) : ''}</button>
                  <div
                    className="flex-1 border-b cursor-crosshair"
                    style={{
                      borderColor: 'rgba(255,255,255,0.045)',
                      background: black ? 'rgba(0,0,0,0.30)' : 'transparent',
                    }}
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      addNote(key, (e.clientX - rect.left) / pxPerBeat);
                    }}
                  />
                </div>
              );
            })}
            {/* bar lines */}
            {Array.from({ length: Math.ceil(clip.lengthBeats) + 1 }, (_, b) => (
              <div key={`b${b}`} className="absolute top-0 bottom-0 pointer-events-none" style={{
                left: KEY_W + b * pxPerBeat, width: 1,
                background: b % 4 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
              }} />
            ))}
            {playheadBeats >= 0 && playheadBeats <= clip.lengthBeats && (
              <div className="absolute top-0 bottom-0 w-[2px] z-20 pointer-events-none" style={{ left: KEY_W + playheadBeats * pxPerBeat, background: PLAYHEAD, boxShadow: `0 0 10px ${PLAYHEAD}` }} />
            )}
            {/* notes with inline MPE swell curve & articulation badge */}
            {notes.map((n) => {
              const r = HIGH - n.key;
              if (r < 0 || r >= ROWS) return null;
              const isSel = n.id === selected;
              const artSpec = ARTICULATION_SPECS.find((a) => a.id === (n.articulation || 'legato')) || ARTICULATION_SPECS[0];
              const noteW = Math.max(6, n.lengthBeats * pxPerBeat - 2);
              const swell = n.expr?.swellShape || (n.lengthBeats >= 2 ? 'hairpin' : 'arch');
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelected(n.id);
                    const el = e.currentTarget as HTMLElement;
                    const nearEnd = e.clientX > el.getBoundingClientRect().right - 8;
                    el.setPointerCapture(e.pointerId);
                    drag.current = { id: n.id, mode: nearEnd ? 'len' : 'move', x: e.clientX, y: e.clientY, start: n.startBeats, len: n.lengthBeats, key: n.key };
                    if (!nearEnd) audition(n.key, n.vel);
                  }}
                  onPointerMove={(e) => {
                    const dr = drag.current;
                    if (!dr || dr.id !== n.id) return;
                    const dBeats = (e.clientX - dr.x) / pxPerBeat;
                    const dRows = Math.round((e.clientY - dr.y) / ROW_H);
                    editNotes((list) => {
                      const t = list.find((x) => x.id === dr.id);
                      if (!t) return;
                      if (dr.mode === 'move') {
                        const raw = Math.max(0, dr.start + dBeats);
                        t.startBeats = snap > 0 ? Math.round(raw / snap) * snap : raw;
                        t.key = Math.max(LOW, Math.min(HIGH, dr.key - dRows));
                      } else {
                        const raw = Math.max(0.05, dr.len + dBeats);
                        t.lengthBeats = snap > 0 ? Math.max(snap, Math.round(raw / snap) * snap) : raw;
                      }
                    });
                  }}
                  onPointerUp={() => {
                    const dr = drag.current;
                    drag.current = null;
                    if (dr?.mode === 'len') {
                      const cur = (clip.notes || []).find((x) => x.id === dr.id);
                      if (cur) setLastLen(cur.lengthBeats);
                    }
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); removeNote(n.id); }}
                  className="absolute rounded-[4px] cursor-grab overflow-hidden"
                  title={`${noteName(n.key)} · vel ${n.vel} · ${artSpec.label} · MPE ${swell} — drag to move, right edge to resize, double-click to delete`}
                  style={{
                    left: KEY_W + n.startBeats * pxPerBeat,
                    top: r * ROW_H + 1,
                    width: noteW,
                    height: ROW_H - 2,
                    background: `linear-gradient(90deg, rgba(212,0,85,${0.32 + (n.vel / 127) * 0.58}), ${artSpec.color}99)`,
                    outline: isSel ? `1.5px solid ${SELECT}` : 'none',
                    outlineOffset: 1,
                    zIndex: 5,
                  }}
                >
                  {/* Inline MPE Envelope Contour Overlay */}
                  {noteW >= 24 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-65" viewBox="0 0 100 20" preserveAspectRatio="none">
                      <path
                        d={
                          swell === 'hairpin'
                            ? 'M 0 16 Q 55 2 100 15'
                            : swell === 'crescendo'
                              ? 'M 0 18 L 100 2'
                              : swell === 'decrescendo'
                                ? 'M 0 2 L 100 18'
                                : swell === 'sfz-swell'
                                  ? 'M 0 2 L 18 15 Q 65 4 100 3'
                                  : 'M 0 14 Q 50 4 100 14'
                        }
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                  {noteW >= 34 && (
                    <span className="relative z-10 pl-1 text-[7.5px] font-mono font-bold text-white/90 leading-none select-none pointer-events-none">
                      {artSpec.short}
                    </span>
                  )}
                  <span className="absolute right-0 top-0 bottom-0 w-[7px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.22)' }} />
                </div>
              );
            })}
          </div>

          {/* Interactive Bottom MPE & Velocity Expression Lane Drawer */}
          {showExprDrawer && (
            <div className="sticky bottom-0 left-0 z-20 border-t border-white/15 bg-[#0D0E14]/95 backdrop-blur-md" style={{ width: KEY_W + width, height: 108 }}>
              <div className="sticky left-0 flex items-center gap-1.5 px-2 h-6 border-b border-white/10 bg-[#12131C] text-[9px]">
                <span className="text-white/40 font-semibold uppercase tracking-wider mr-1">MPE Expression Lane:</span>
                {(
                  [
                    { id: 'pressure', label: 'MPE Pressure / CC11 Swell', color: '#38BDF8' },
                    { id: 'velocity', label: 'Note Velocity (1–127)', color: '#F43F5E' },
                    { id: 'timbre', label: 'MPE Timbre / CC74 Brightness', color: '#A78BFA' },
                    { id: 'vibrato', label: 'Vibrato Depth (LFO)', color: '#34D399' },
                    { id: 'bend', label: 'MPE Pitch Bend / Glide', color: '#FBBF24' },
                  ] as const
                ).map((lane) => (
                  <button
                    key={lane.id}
                    onClick={() => setExprLane(lane.id)}
                    className={`px-2 py-0.5 rounded text-[9px] font-medium transition ${
                      exprLane === lane.id ? 'bg-white/15 text-white border border-white/25' : 'text-white/45 hover:text-white/75'
                    }`}
                    style={exprLane === lane.id ? { color: lane.color } : undefined}
                  >
                    {lane.label}
                  </button>
                ))}
                <span className="ml-auto text-white/35">Click or drag any note’s MPE stalk to sculpt expression</span>
              </div>

              <div className="relative h-[82px]" style={{ marginLeft: KEY_W, width }}>
                {/* Horizontal reference grid lines */}
                <div className="absolute inset-x-0 top-1/4 border-t border-white/[0.05] pointer-events-none" />
                <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.08] pointer-events-none" />
                <div className="absolute inset-x-0 top-3/4 border-t border-white/[0.05] pointer-events-none" />

                {notes.map((n) => {
                  const left = n.startBeats * pxPerBeat;
                  const w = Math.max(8, n.lengthBeats * pxPerBeat - 2);
                  const val01 =
                    exprLane === 'velocity'
                      ? n.vel / 127
                      : exprLane === 'pressure'
                        ? n.expr?.pressure ?? n.vel / 127
                        : exprLane === 'timbre'
                          ? n.expr?.timbre ?? 0.65
                          : exprLane === 'vibrato'
                            ? Math.min(1, (n.expr?.vibratoDepth ?? 0.16) / 0.5)
                            : ((n.expr?.bend ?? 0) + 1) * 0.5;
                  const barH = Math.max(6, Math.round(val01 * 72));
                  const color =
                    exprLane === 'pressure'
                      ? '#38BDF8'
                      : exprLane === 'velocity'
                        ? '#F43F5E'
                        : exprLane === 'timbre'
                          ? '#A78BFA'
                          : exprLane === 'vibrato'
                            ? '#34D399'
                            : '#FBBF24';

                  return (
                    <div
                      key={`expr_${n.id}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelected(n.id);
                        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        const new01 = Math.max(0.05, Math.min(1, 1 - (e.clientY - rect.top) / 76));
                        editNotes((list) => {
                          const target = list.find((x) => x.id === n.id);
                          if (!target) return;
                          if (exprLane === 'velocity') {
                            target.vel = Math.max(1, Math.min(127, Math.round(new01 * 127)));
                          } else {
                            target.expr = { ...(target.expr || {}) };
                            if (exprLane === 'pressure') target.expr.pressure = Number(new01.toFixed(2));
                            else if (exprLane === 'timbre') target.expr.timbre = Number(new01.toFixed(2));
                            else if (exprLane === 'vibrato') target.expr.vibratoDepth = Number((new01 * 0.5).toFixed(2));
                            else if (exprLane === 'bend') target.expr.bend = Number(((new01 - 0.5) * 2).toFixed(2));
                          }
                        });
                      }}
                      className="absolute bottom-1 rounded-t cursor-ns-resize group"
                      style={{
                        left,
                        width: w,
                        height: barH,
                        background: `linear-gradient(180deg, ${color}cc, ${color}33)`,
                        borderTop: `2px solid ${color}`,
                      }}
                      title={`${noteName(n.key)} · ${exprLane}: ${Math.round(val01 * 100)}%`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // ── step grid over the same notes ──
        <div className="flex-1 min-h-0 overflow-auto p-3">
          <p className="text-[9px] text-white/25 mb-2">Same notes as the piano roll, snapped to 16ths. Click a cell to add or remove.</p>
          <div className="flex flex-col gap-1">
            {stepRows.map((key) => (
              <div key={key} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '52px 1fr' }}>
                <button onPointerDown={() => audition(key)} className="text-[10px] font-mono text-white/50 text-right pr-1 hover:text-white">{noteName(key)}</button>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0,1fr))` }}>
                  {Array.from({ length: stepCount }, (_, s) => {
                    const at = s * 0.25;
                    const hit = notes.find((n) => n.key === key && Math.abs(n.startBeats - at) < 0.125);
                    return (
                      <button
                        key={s}
                        onClick={() => (hit ? removeNote(hit.id) : addNote(key, at))}
                        aria-label={`${noteName(key)} step ${s + 1}`}
                        className="h-5 rounded-[3px] border transition"
                        style={{
                          background: hit ? `rgba(212,0,85,${0.35 + (hit.vel / 127) * 0.6})` : s % 4 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)',
                          borderColor: hit ? '#D40055' : 'rgba(255,255,255,0.06)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
