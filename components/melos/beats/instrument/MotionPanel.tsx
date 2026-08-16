// The Motion rack — the modulators, and the gesture that connects them to anything.
//
// The whole interaction is one thing: grab a Motion's handle, drop it on a knob. The knob then
// draws a coloured arc showing how far that Motion will push it. No matrix page to visit; the
// matrix view below is just a readable list of what you already did.

import React from 'react';
import { Plus, Trash2, Waves, AlertTriangle } from 'lucide-react';
import {
  MOTION_SHAPES, MOTION_COLORS, PLAY_SOURCES, newMotion,
  type Motion, type MotionShape, type PlaySource,
} from '../../../../services/melos/motion';
import { paramLabel } from '../../../../services/melos/instruments/onda/params';
import { Knob } from '../shared/Knob';

interface Props {
  motions: Motion[];
  /** Motion currently being dragged onto a knob, if any. */
  dragging: string | null;
  unplaced: Array<{ motionId: string; reason: string }>;
  onDragStart: (id: string | null) => void;
  onChange: (fn: (list: Motion[]) => void) => void;
}

const SYNC_OPTIONS = [
  { v: 0, label: 'Free' }, { v: 4, label: '1 bar' }, { v: 2, label: '1/2' },
  { v: 1, label: '1/4' }, { v: 0.5, label: '1/8' }, { v: 0.25, label: '1/16' },
];

export const MotionPanel: React.FC<Props> = ({ motions, dragging, unplaced, onDragStart, onChange }) => {
  const add = (shape: MotionShape) => onChange((list) => {
    if (list.length >= 8) return;
    list.push(newMotion(shape, list.length));
  });

  const edit = (id: string, fn: (m: Motion) => void) => onChange((list) => {
    const m = list.find((x) => x.id === id);
    if (m) fn(m);
  });

  return (
    <div className="rounded-2xl border border-white/10 p-3" style={{ background: '#111116' }}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <Waves size={12} className="text-white/40" />
        <span className="text-[9.5px] uppercase tracking-[0.18em] text-white/40 font-semibold">Motion</span>
        <span className="text-[9px] text-white/22">drag a handle onto any knob</span>
        <span className="flex-1" />
        {MOTION_SHAPES.map((s) => (
          <button
            key={s.id}
            onClick={() => add(s.id)}
            disabled={motions.length >= 8}
            title={`${s.hint}  (${s.familiar})`}
            className="h-6 px-2 rounded-lg text-[10px] border border-white/12 text-white/45 hover:text-white hover:border-white/30 disabled:opacity-30"
          >+ {s.name}</button>
        ))}
      </div>

      {motions.length === 0 && (
        <p className="text-[11px] text-white/25 py-3">
          Nothing is moving yet. Add a <b className="text-white/50">Curve</b> and drag its handle onto the filter cutoff.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {motions.map((m) => {
          const problem = unplaced.find((u) => u.motionId === m.id);
          const shape = MOTION_SHAPES.find((s) => s.id === m.shape)!;
          const isDragging = dragging === m.id;
          return (
            <div
              key={m.id}
              className="rounded-xl border p-2.5"
              style={{
                borderColor: isDragging ? m.color : problem ? '#F59E0B59' : 'rgba(255,255,255,0.09)',
                background: isDragging ? `${m.color}12` : 'rgba(255,255,255,0.02)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {/* the drag handle — the whole interaction */}
                <button
                  onPointerDown={() => onDragStart(m.id)}
                  title="Drag onto any knob to modulate it"
                  aria-label={`Map ${m.name}`}
                  className="w-6 h-6 rounded-full flex-none cursor-grab active:cursor-grabbing"
                  style={{ background: m.color, boxShadow: isDragging ? `0 0 14px ${m.color}` : 'none' }}
                />
                <input
                  value={m.name}
                  onChange={(e) => edit(m.id, (x) => { x.name = e.target.value; })}
                  className="w-24 h-6 bg-transparent border border-transparent hover:border-white/10 focus:border-white/25 rounded px-1.5 text-[11px] font-semibold text-white outline-none"
                  aria-label="Motion name"
                />
                <select
                  value={m.shape}
                  onChange={(e) => edit(m.id, (x) => { x.shape = e.target.value as MotionShape; })}
                  className="h-6 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[10px] text-white outline-none"
                >
                  {MOTION_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {/* shape-specific controls */}
                {(m.shape === 'curve' || m.shape === 'steps' || m.shape === 'random') && (
                  <>
                    <select
                      value={m.syncBeats}
                      onChange={(e) => edit(m.id, (x) => { x.syncBeats = Number(e.target.value); })}
                      className="h-6 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[10px] text-white outline-none"
                    >
                      {SYNC_OPTIONS.map((o) => <option key={o.label} value={o.v}>{o.label}</option>)}
                    </select>
                    {m.syncBeats === 0 && (
                      <label className="flex items-center gap-1 text-[9.5px] text-white/35">
                        Rate
                        <input type="range" min={0} max={100} value={Math.round(m.rate * 100)}
                          onChange={(e) => edit(m.id, (x) => { x.rate = Number(e.target.value) / 100; })}
                          className="w-16 accent-[#00DAF3]" />
                      </label>
                    )}
                    <button
                      onClick={() => edit(m.id, (x) => { x.bipolar = !x.bipolar; })}
                      title={m.bipolar ? 'Moves both ways from the value' : 'Only pushes upward'}
                      className="h-6 px-2 rounded-lg text-[9.5px] border"
                      style={m.bipolar
                        ? { borderColor: m.color, color: m.color }
                        : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
                    >{m.bipolar ? '±' : '+'}</button>
                  </>
                )}
                {m.shape === 'play' && (
                  <select
                    value={m.playSource || 'velocity'}
                    onChange={(e) => edit(m.id, (x) => { x.playSource = e.target.value as PlaySource; })}
                    title={PLAY_SOURCES.find((s) => s.id === (m.playSource || 'velocity'))?.hint}
                    className="h-6 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[10px] text-white outline-none"
                  >
                    {PLAY_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {m.shape === 'macro' && (
                  <select
                    value={m.macroIndex ?? 0}
                    onChange={(e) => edit(m.id, (x) => { x.macroIndex = Number(e.target.value); })}
                    className="h-6 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[10px] text-white outline-none"
                  >
                    {Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>Macro {i + 1}</option>)}
                  </select>
                )}
                {m.shape === 'envelope' && (
                  <span className="text-[9.5px] text-white/30">per note</span>
                )}

                <span className="flex-1" />
                <button
                  onClick={() => edit(m.id, (x) => { x.perVoice = !x.perVoice; })}
                  title={m.perVoice ? 'Every note gets its own copy' : 'One shared copy for all notes'}
                  className="h-6 px-2 rounded-lg text-[9.5px] border"
                  style={m.perVoice
                    ? { borderColor: '#06D6A0', color: '#06D6A0' }
                    : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
                >{m.perVoice ? 'per note' : 'shared'}</button>
                <button
                  onClick={() => onChange((list) => { const i = list.findIndex((x) => x.id === m.id); if (i >= 0) list.splice(i, 1); })}
                  aria-label={`Remove ${m.name}`}
                  className="w-6 h-6 grid place-items-center rounded text-white/25 hover:text-[#EF4444]"
                ><Trash2 size={11} /></button>
              </div>

              <p className="text-[9px] text-white/22 mt-1 ml-8">{shape.hint}</p>

              {problem && (
                <p className="text-[9.5px] mt-1.5 ml-8 flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
                  <AlertTriangle size={10} /> {problem.reason}
                </p>
              )}

              {/* what it drives — the matrix, as a readable list rather than a page */}
              {m.routes.length > 0 && (
                <div className="mt-2 ml-8 flex flex-col gap-1">
                  {m.routes.map((r, ri) => (
                    <div key={ri} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/45 flex-1 truncate">→ {paramLabel(r.paramId)}</span>
                      <input
                        type="range" min={-100} max={100} value={Math.round(r.depth * 100)}
                        onChange={(e) => edit(m.id, (x) => { x.routes[ri].depth = Number(e.target.value) / 100; })}
                        className="w-24"
                        style={{ accentColor: m.color }}
                        aria-label={`Depth for ${paramLabel(r.paramId)}`}
                      />
                      <span className="font-mono text-[9.5px] text-white/40 w-9 text-right">
                        {r.depth > 0 ? '+' : ''}{Math.round(r.depth * 100)}
                      </span>
                      <button
                        onClick={() => edit(m.id, (x) => { x.routes.splice(ri, 1); })}
                        aria-label="Unmap"
                        className="w-5 h-5 grid place-items-center rounded text-white/20 hover:text-[#EF4444]"
                      ><Trash2 size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {dragging && (
        <p className="mt-2.5 text-[10px] px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,140,0,0.1)', color: '#FF8C00' }}>
          Drop on a knob to modulate it — release anywhere else to cancel.
        </p>
      )}
    </div>
  );
};
