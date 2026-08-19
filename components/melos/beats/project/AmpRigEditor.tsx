// The Amp Rack editor — the backline, not a knob grid.
//
// This is the "easier than Guitar Rig" half of the promise: you pick a rig by NAME first
// (presets), and only open the pedalboard/head/cab if you want to move something. Everything
// writes into the same flat numeric params the amprig device reads, so it stays serializable
// and prints in the offline render like any other device.

import React from 'react';
import { Power } from 'lucide-react';
import {
  AMP_MODELS, CAB_MODELS, MIC_MODELS, PEDAL_MODELS, RIG_PRESETS,
  ampModelAt, cabModelAt, pedalModelAt,
} from '../../../../services/melos/beats/fx/ampModels';
import { Knob } from '../shared/Knob';

interface AmpRigEditorProps {
  params: Record<string, number>;
  onChange: (patch: Record<string, number>) => void;
  color: string;
}

const selCls = 'h-7 rounded-lg bg-black/45 border border-white/10 text-[10.5px] text-white/80 px-1.5 outline-none';

export const AmpRigEditor: React.FC<AmpRigEditorProps> = ({ params, onChange, color }) => {
  const amp = ampModelAt(params.amp ?? 4);
  const cab = cabModelAt(params.cab ?? 3);
  const set = (k: string, v: number) => onChange({ [k]: v });

  const ampKnob = (key: string, label: string) => (
    <Knob
      key={key}
      label={label}
      value={params[key] ?? 0.5}
      min={0} max={1} defaultValue={0.5}
      color={color} size={34}
      format={(v) => `${Math.round(v * 10)}`}
      onChange={(v) => set(key, v)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {/* ── Rig presets: pick a sound by name ── */}
      <div>
        <span className="text-[8.5px] font-extrabold uppercase tracking-[0.16em] text-white/30">Rigs</span>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {RIG_PRESETS.map((r) => (
            <button
              key={r.id}
              onClick={() => onChange(r.params)}
              title={r.blurb}
              className="h-7 px-2.5 rounded-full text-[10px] font-bold border border-white/15 text-white/65 hover:text-white hover:bg-white/10"
            >{r.label}</button>
          ))}
        </div>
      </div>

      {/* ── Pedalboard ── */}
      <div>
        <span className="text-[8.5px] font-extrabold uppercase tracking-[0.16em] text-white/30">Pedalboard</span>
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {[1, 2].map((slot) => {
            const on = (params[`pedal${slot}On`] ?? 0) > 0.5;
            const model = pedalModelAt(params[`pedal${slot}`] ?? 0);
            return (
              <div
                key={slot}
                className="rounded-[10px] border p-2 flex flex-col items-center gap-1.5 w-[104px]"
                style={{
                  borderColor: on ? model.color : 'rgba(255,255,255,0.12)',
                  background: on ? `${model.color}1f` : 'rgba(255,255,255,0.02)',
                }}
                title={model.blurb}
              >
                <select
                  value={Math.round(params[`pedal${slot}`] ?? 0)}
                  onChange={(e) => set(`pedal${slot}`, Number(e.target.value))}
                  className="w-full h-6 rounded-md bg-black/50 border border-white/10 text-[9.5px] text-white/85 px-1 outline-none"
                  aria-label={`Pedal ${slot} type`}
                >
                  {PEDAL_MODELS.map((m, i) => <option key={m.id} value={i}>{m.label}</option>)}
                </select>
                <Knob
                  label="Drive"
                  value={params[`pedal${slot}Drive`] ?? 0.4}
                  min={0} max={1} defaultValue={0.4}
                  color={model.color} size={30}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set(`pedal${slot}Drive`, v)}
                />
                <button
                  onClick={() => set(`pedal${slot}On`, on ? 0 : 1)}
                  className="w-7 h-7 rounded-full grid place-items-center border-2"
                  style={{
                    borderColor: 'rgba(0,0,0,0.55)',
                    background: on ? model.color : 'rgba(255,255,255,0.12)',
                    color: on ? '#12080a' : 'rgba(255,255,255,0.5)',
                  }}
                  aria-label={`${on ? 'Bypass' : 'Engage'} pedal ${slot}`}
                ><Power size={12} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── The head ── */}
      <div
        className="rounded-[12px] border border-white/20 p-2.5"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 45%), repeating-linear-gradient(90deg, #241a1a 0 3px, #1d1414 3px 6px)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <select
            value={Math.round(params.amp ?? 4)}
            onChange={(e) => set('amp', Number(e.target.value))}
            className={selCls}
            aria-label="Amp model"
          >
            {AMP_MODELS.map((m, i) => <option key={m.id} value={i}>{m.label}</option>)}
          </select>
          <span className="text-[9px] text-white/40 truncate ml-2">{amp.blurb}</span>
        </div>
        <div className="flex gap-3 flex-wrap justify-between">
          <Knob label="Gain" value={params.gain ?? 0.5} min={0} max={1} defaultValue={0.5} color={color} size={36}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('gain', v)} />
          {ampKnob('bass', 'Bass')}
          {ampKnob('mid', 'Mid')}
          {ampKnob('treble', 'Treble')}
          {ampKnob('presence', 'Presence')}
          {ampKnob('resonance', 'Resonance')}
          <Knob label="Sag" value={params.sagAmt ?? 0.4} min={0} max={1} defaultValue={0.4} color="#D40055" size={34}
            format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('sagAmt', v)} />
          {ampKnob('master', 'Master')}
        </div>
        <div className="mt-1.5 text-[8px] text-white/25">
          {amp.stages} gain stage{amp.stages > 1 ? 's' : ''} · sag models supply droop under load · presence &amp; resonance ride the power amp
        </div>
      </div>

      {/* ── Cab + mic ── */}
      <div className="flex gap-2 items-stretch flex-wrap">
        <div
          className="rounded-[12px] border border-white/20 grid place-items-center p-3 relative"
          style={{ width: 118, background: 'repeating-linear-gradient(45deg, #151013 0 2px, #1b1418 2px 4px)' }}
        >
          <div
            className="w-[64px] h-[64px] rounded-full border-2 border-white/15"
            style={{ background: 'radial-gradient(circle, #0c0a0e 0 28%, #241d28 30% 58%, #0f0b12 60%)' }}
          />
        </div>
        <div className="flex-1 min-w-[190px] flex flex-col gap-1.5">
          <select value={Math.round(params.cab ?? 3)} onChange={(e) => set('cab', Number(e.target.value))} className={selCls} aria-label="Cabinet">
            {CAB_MODELS.map((m, i) => <option key={m.id} value={i}>{m.label}</option>)}
          </select>
          <select value={Math.round(params.mic ?? 0)} onChange={(e) => set('mic', Number(e.target.value))} className={selCls} aria-label="Microphone">
            {MIC_MODELS.map((m, i) => <option key={m.id} value={i}>{m.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-[9px] uppercase tracking-wide text-white/40">
            Cap
            <input
              type="range" min={0} max={1} step={0.01}
              value={params.micEdge ?? 0.4}
              onChange={(e) => set('micEdge', Number(e.target.value))}
              className="flex-1 accent-[#E8A33D]"
              aria-label="Mic position, cap to edge"
            />
            Edge
          </label>
          <span className="text-[8px] text-white/25">
            {cab.id === 'direct' ? 'Cab bypassed — straight into the desk' : `Rolls off at ${(cab.rolloffHz / 1000).toFixed(1)} kHz · cap is bright, edge is round`}
          </span>
        </div>
      </div>
    </div>
  );
};
