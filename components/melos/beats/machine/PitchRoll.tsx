// The pitch roll — Maschine keyboard mode meets FL's per-channel piano roll, living in the
// space above the pads. Draw notes for the SELECTED pad on the same 16-step grid: click to
// add (auditions), click a note to remove, drag a note's right edge to stretch it — length
// gates the pad's AHDSR envelope, so subs hold and release exactly as drawn.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GrooveDoc, MeloNote, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD, SURFACE_CELL } from '../theme';

const SEMI_TOP = 12;    // +1 octave above the pad's base pitch…
const SEMI_BOTTOM = -12; // …down to -1 octave. Base row (0) is the pad's own tuning.
const ROW_H = 13;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

// Display convention: offset 0 = the pad's base pitch, labeled as C3 for orientation.
const labelFor = (semi: number) => {
  const midi = 48 + semi; // C3 = 48
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
};

interface PitchRollProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const PitchRoll: React.FC<PitchRollProps> = ({ doc, pattern, selectedPad, beats, running, playMode, onMutate }) => {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ semi: number; step: number; startX: number; startLen: number; moved: boolean } | null>(null);

  useEffect(() => {
    // Center the scroll on the base row when opening / switching pads.
    const el = scrollRef.current;
    if (el) el.scrollTop = (SEMI_TOP - 4) * ROW_H;
  }, [open, selectedPad]);

  const pad = doc.kit[selectedPad];
  const lane = pattern.melo?.[selectedPad] || {};
  const playStep = running && playMode === 'pattern'
    ? ((Math.floor(beats / 0.25) % pattern.length) + pattern.length) % pattern.length
    : -1;
  const noteColor = pad?.color && pad.color !== '#F5F0FA' ? pad.color : '#D0BCFF';

  const mutateLane = useCallback((fn: (lane: Record<number, MeloNote[]>) => void) => {
    onMutate((d) => {
      const pat = d.patterns.find((p) => p.id === pattern.id);
      if (!pat) return;
      const melo = pat.melo || (pat.melo = {});
      const l = melo[selectedPad] || (melo[selectedPad] = {});
      fn(l);
    });
  }, [onMutate, pattern.id, selectedPad]);

  const addNote = useCallback((semi: number, step: number) => {
    mutateLane((l) => {
      const arr = l[step] || (l[step] = []);
      if (!arr.some((n) => n.semi === semi)) arr.push({ semi, v: 100, len: 1 });
    });
    // Audition the drawn pitch for one step so drawing is musical, not clerical.
    const engine = BeatsEngine.get();
    void engine.init().then(() => engine.trigger(selectedPad, 100, undefined, (60 / doc.bpm) * 0.25, semi));
  }, [mutateLane, selectedPad, doc.bpm]);

  const removeNote = useCallback((semi: number, step: number) => {
    mutateLane((l) => {
      const arr = l[step];
      if (!arr) return;
      const i = arr.findIndex((n) => n.semi === semi);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) delete l[step];
    });
  }, [mutateLane]);

  if (!pad) return null;
  const cols = Math.min(pattern.length, 16);

  return (
    <div className="w-full max-w-[640px] mx-auto mb-4 select-none">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 mb-1.5 text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 hover:text-white/60">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Notes · {pad.name} <span className="text-white/20 normal-case tracking-normal">draw pitched notes — length gates the envelope</span>
      </button>
      {open && (
        <div ref={scrollRef} className="relative overflow-y-auto rounded-lg border border-white/10" style={{ height: 200, background: '#0B0B0F' }}>
          <div className="relative" style={{ height: (SEMI_TOP - SEMI_BOTTOM + 1) * ROW_H, marginLeft: 34 }}>
            {/* row stripes + labels */}
            {Array.from({ length: SEMI_TOP - SEMI_BOTTOM + 1 }, (_, r) => {
              const semi = SEMI_TOP - r;
              const midi = 48 + semi;
              const black = BLACK.has(((midi % 12) + 12) % 12);
              return (
                <div key={r} className="absolute left-0 right-0" style={{ top: r * ROW_H, height: ROW_H, background: semi === 0 ? 'rgba(0,218,243,0.06)' : black ? 'rgba(0,0,0,0.35)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span className="absolute text-[8px] font-mono leading-none" style={{ left: -32, top: 2, color: semi === 0 ? PLAYHEAD : 'rgba(255,255,255,0.25)' }}>{labelFor(semi)}</span>
                </div>
              );
            })}
            {/* click grid */}
            {Array.from({ length: (SEMI_TOP - SEMI_BOTTOM + 1) * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const semi = SEMI_TOP - r;
              return (
                <div
                  key={i}
                  onPointerDown={() => addNote(semi, c)}
                  className="absolute cursor-crosshair"
                  style={{
                    top: r * ROW_H, height: ROW_H,
                    left: `${(c / cols) * 100}%`, width: `${100 / cols}%`,
                    borderLeft: c % 4 === 0 ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(255,255,255,0.03)',
                    background: playStep === c ? 'rgba(0,218,243,0.05)' : 'transparent',
                  }}
                />
              );
            })}
            {/* notes */}
            {Object.entries(lane).flatMap(([stepKey, notes]) => (notes || []).map((n) => {
              const step = Number(stepKey);
              if (step >= cols || n.semi > SEMI_TOP || n.semi < SEMI_BOTTOM) return null;
              const r = SEMI_TOP - n.semi;
              return (
                <div
                  key={`${step}-${n.semi}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    drag.current = { semi: n.semi, step, startX: e.clientX, startLen: n.len, moved: false };
                  }}
                  onPointerMove={(e) => {
                    const dr = drag.current;
                    if (!dr || dr.semi !== n.semi || dr.step !== step) return;
                    const cellW = (e.currentTarget.parentElement?.clientWidth || 600) / cols;
                    const dLen = Math.round((e.clientX - dr.startX) / cellW);
                    if (dLen !== 0) dr.moved = true;
                    const next = Math.max(1, Math.min(cols - step, dr.startLen + dLen));
                    mutateLane((l) => { const t = l[step]?.find((x) => x.semi === n.semi); if (t && t.len !== next) t.len = next; });
                  }}
                  onPointerUp={() => {
                    const dr = drag.current;
                    drag.current = null;
                    if (dr && !dr.moved) removeNote(n.semi, step);
                  }}
                  className="absolute rounded-[4px] cursor-ew-resize"
                  style={{
                    top: r * ROW_H + 1.5, height: ROW_H - 3,
                    left: `${(step / cols) * 100}%`, width: `calc(${(n.len / cols) * 100}% - 2px)`,
                    background: `${noteColor}CC`,
                    boxShadow: `0 0 6px ${noteColor}55`,
                    touchAction: 'none',
                  }}
                  title={`${labelFor(n.semi)} · ${n.len} step${n.len > 1 ? 's' : ''} — drag right edge to stretch, click to remove`}
                />
              );
            }))}
          </div>
        </div>
      )}
    </div>
  );
};
