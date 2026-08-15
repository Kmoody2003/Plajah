// The piano roll — the instrument-track note editor.
//
// One note list, two editors: this and the step grid render the SAME `clip.notes`, so switching
// between them is a view change, never a conversion. Notes may sit off-grid here; the scheduler
// fires them at their exact time, and the step grid simply shows them snapped.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Grid3x3, Music4, Trash2 } from 'lucide-react';
import type { GrooveDoc, NoteEvent, TimelineClip } from '../../../../services/melos/beats/grooveDoc';
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
  const drag = useRef<{ id: string; mode: 'move' | 'len'; x: number; y: number; start: number; len: number; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const track = doc.arrangement.find((t) => t.id === trackId);
  const notes = clip.notes || [];
  const width = clip.lengthBeats * pxPerBeat;

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
    const snapped = Math.max(0, Math.round(startBeats / snap) * snap);
    const id = grooveUid();
    editNotes((list) => {
      list.push({ id, startBeats: snapped, lengthBeats: lastLen, key, vel: 100 });
    });
    setSelected(id);
    audition(key);
  }, [editNotes, snap, lastLen, audition]);

  const removeNote = useCallback((id: string) => {
    editNotes((list) => {
      const i = list.findIndex((n) => n.id === id);
      if (i >= 0) list.splice(i, 1);
    });
    if (selected === id) setSelected(null);
  }, [editNotes, selected]);

  const playheadBeats = running && playMode === 'song' ? beats - clip.startBeats : -1;

  // ── step grid: the same notes on a 16th grid, one row per pitch actually in use ──
  const stepRows = useMemo(() => {
    const keys = [...new Set(notes.map((n) => n.key))].sort((a, b) => b - a);
    return keys.length ? keys : [60];
  }, [notes]);
  const stepCount = Math.max(16, Math.round(clip.lengthBeats * 4));

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#0A0A0D] flex flex-col" style={{ height: '46%' }}>
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/10 flex-none">
        <span className="text-[10px] uppercase tracking-[0.16em] text-white/35 font-semibold">
          {track?.name || 'Clip'}
        </span>
        <span className="text-[10px] text-white/25">{notes.length} notes</span>
        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 ml-1">
          <button onClick={() => setMode('roll')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'roll' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Music4 size={10} /> Piano roll</button>
          <button onClick={() => setMode('steps')} className={`h-6 px-2 rounded-md text-[10px] flex items-center gap-1 ${mode === 'steps' ? 'bg-white/15 text-white font-semibold' : 'text-white/40'}`}><Grid3x3 size={10} /> Steps</button>
        </div>
        <label className="flex items-center gap-1 text-[10px] text-white/35">Snap
          <select value={snap} onChange={(e) => setSnap(Number(e.target.value))} className="bg-black/40 border border-white/10 rounded px-1 h-6 text-[10px] text-white/70 outline-none">
            <option value={1}>1/4</option><option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option><option value={0.125}>1/32</option>
            <option value={0}>off</option>
          </select>
        </label>
        {mode === 'roll' && (
          <label className="flex items-center gap-1 text-[10px] text-white/35">Zoom
            <input type="range" min={24} max={160} value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} className="w-20 accent-[#D0BCFF]" />
          </label>
        )}
        <span className="flex-1" />
        {selected && (
          <button onClick={() => removeNote(selected)} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-[#EF4444] text-[10px] flex items-center gap-1">
            <Trash2 size={10} /> Delete
          </button>
        )}
        <button onClick={onClose} className="h-6 px-2.5 rounded-lg border border-white/15 text-white/50 hover:text-white text-[10px]">Close</button>
      </div>

      {mode === 'roll' ? (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
          <div className="relative" style={{ width: KEY_W + width, height: ROWS * ROW_H }}>
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
            {/* notes */}
            {notes.map((n) => {
              const r = HIGH - n.key;
              if (r < 0 || r >= ROWS) return null;
              const isSel = n.id === selected;
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
                      if (cur) setLastLen(cur.lengthBeats); // new notes inherit the length you last drew
                    }
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); removeNote(n.id); }}
                  className="absolute rounded-[4px] cursor-grab"
                  title={`${noteName(n.key)} · vel ${n.vel} — drag to move, right edge to resize, double-click to delete`}
                  style={{
                    left: KEY_W + n.startBeats * pxPerBeat,
                    top: r * ROW_H + 1,
                    width: Math.max(6, n.lengthBeats * pxPerBeat - 2),
                    height: ROW_H - 2,
                    // Velocity reads as opacity — you can see dynamics without opening a lane.
                    background: `rgba(212,0,85,${0.35 + (n.vel / 127) * 0.6})`,
                    outline: isSel ? `1.5px solid ${SELECT}` : 'none',
                    outlineOffset: 1,
                    zIndex: 5,
                  }}
                >
                  <span className="absolute right-0 top-0 bottom-0 w-[7px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.16)' }} />
                </div>
              );
            })}
          </div>
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
                        className="h-[22px] rounded-[6px]"
                        style={{
                          background: hit
                            ? `rgba(212,0,85,${0.35 + (hit.vel / 127) * 0.6})`
                            : s % 8 < 4 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.045)',
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
