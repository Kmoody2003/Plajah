// The right-rail macro section: 8 knobs + routing chips for the SELECTED pad — the Maschine
// "shape the sound under your right hand" column. Writes straight into the doc; the engine
// picks params up on the next trigger (per-voice params) or immediately (strip params).

import React from 'react';
import type { GrooveDoc, PadFilterType, VelCurve } from '../../../../services/melos/beats/grooveDoc';
import { GROUP_NAMES } from '../../../../services/melos/beats/grooveDoc';
import { Knob } from '../shared/Knob';
import { ARMED, GROUP_COLORS, SELECT } from '../theme';

interface MacroKnobsProps {
  doc: GrooveDoc;
  selectedPad: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

const FILTER_TYPES: { id: PadFilterType; label: string }[] = [
  { id: 'off', label: 'Off' }, { id: 'lowpass', label: 'LP' }, { id: 'highpass', label: 'HP' },
];
const VEL_CURVES: VelCurve[] = ['linear', 'soft', 'hard'];

export const MacroKnobs: React.FC<MacroKnobsProps> = ({ doc, selectedPad, onMutate }) => {
  const pad = doc.kit[selectedPad];
  if (!pad) return null;
  const set = (fn: (p: typeof pad) => void) => onMutate((d) => { const p = d.kit[selectedPad]; if (p) fn(p); });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Macros · {pad.name}</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 justify-items-center">
          <Knob label="Tune" value={pad.pitchSemis} min={-24} max={24} defaultValue={0} color={ARMED}
            format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}st`} onChange={(v) => set((p) => { p.pitchSemis = Math.round(v); })} />
          <Knob label="Attack" value={pad.env.attackMs} min={0} max={200} defaultValue={0}
            format={(v) => `${v.toFixed(0)}ms`} onChange={(v) => set((p) => { p.env.attackMs = Math.round(v); })} />
          <Knob label="Decay" value={pad.env.decayMs} min={20} max={2000} defaultValue={400}
            format={(v) => `${v.toFixed(0)}ms`} onChange={(v) => set((p) => { p.env.decayMs = Math.round(v); })} />
          <Knob label="Hold" value={pad.env.holdMs} min={0} max={500} defaultValue={0}
            format={(v) => `${v.toFixed(0)}ms`} onChange={(v) => set((p) => { p.env.holdMs = Math.round(v); })} />
          <Knob label="Sustain" value={pad.env.sustain} min={0} max={1} defaultValue={0} color={ARMED}
            format={(v) => v < 0.005 ? 'off' : `${Math.round(v * 100)}%`} onChange={(v) => set((p) => { p.env.sustain = v; })} />
          <Knob label="Release" value={pad.env.releaseMs} min={5} max={2000} defaultValue={80}
            format={(v) => `${v.toFixed(0)}ms`} onChange={(v) => set((p) => { p.env.releaseMs = Math.round(v); })} />
          <Knob label="Cutoff" value={pad.filter.cutoff} min={60} max={18000} defaultValue={8000}
            format={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`} onChange={(v) => set((p) => { p.filter.cutoff = Math.round(v); })} />
          <Knob label="Reso" value={pad.filter.q} min={0.3} max={12} defaultValue={0.8}
            format={(v) => v.toFixed(1)} onChange={(v) => set((p) => { p.filter.q = v; })} />
          <Knob label="Gain" value={pad.gainDb} min={-24} max={12} defaultValue={0} color={SELECT}
            format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}dB`} onChange={(v) => set((p) => { p.gainDb = v; })} />
          <Knob label="Pan" value={pad.pan} min={-1} max={1} defaultValue={0}
            format={(v) => Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`}
            onChange={(v) => set((p) => { p.pan = v; })} />
        </div>
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Filter</p>
        <div className="flex gap-1">
          {FILTER_TYPES.map((f) => (
            <button key={f.id} onClick={() => set((p) => { p.filter.type = f.id; })}
              className={`h-6 px-2.5 rounded-lg text-[10px] border ${pad.filter.type === f.id ? 'bg-white/15 border-white/25 text-white font-semibold' : 'border-white/10 text-white/40 hover:text-white'}`}
            >{f.label}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Velocity</p>
        <div className="flex gap-1">
          {VEL_CURVES.map((c) => (
            <button key={c} onClick={() => set((p) => { p.velCurve = c; })}
              className={`h-6 px-2.5 rounded-lg text-[10px] border capitalize ${pad.velCurve === c ? 'bg-white/15 border-white/25 text-white font-semibold' : 'border-white/10 text-white/40 hover:text-white'}`}
            >{c}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Bus · Choke</p>
        <div className="flex gap-1">
          {GROUP_NAMES.map((g, i) => (
            <button key={g} onClick={() => set((p) => { p.group = i as 0 | 1 | 2 | 3; })}
              className="h-6 w-7 rounded-lg text-[10px] border font-mono"
              style={pad.group === i
                ? { background: `${GROUP_COLORS[i]}26`, borderColor: `${GROUP_COLORS[i]}66`, color: GROUP_COLORS[i], fontWeight: 600 }
                : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >{g}</button>
          ))}
          <div className="w-2" />
          <select
            value={pad.choke}
            onChange={(e) => set((p) => { p.choke = Number(e.target.value); })}
            className="h-6 rounded-lg bg-black/40 border border-white/10 text-[10px] text-white/60 px-1 outline-none"
            title="Choke group — a new hit silences other pads in the same group (open/closed hats)"
          >
            <option value={0}>choke —</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>choke {n}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};
