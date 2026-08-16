// The Arp — five controls closed, the whole step engine open.
//
// The ethos in one component: someone who has never made music holds a chord and it plays
// something musical immediately; someone who knows what a trig condition is finds one waiting.
// Nothing is hidden behind a mode switch — "More" just grows the panel.

import React, { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Dices, Sparkles, Lock, Trash2 } from 'lucide-react';
import {
  ARP_ORDERS, TRIG_CONDITIONS, defaultStep, euclidean,
  type ArpOrder, type ArpPatch, type ArpStep, type TrigCondition,
} from '../../../../services/melos/arp';
import { SCALES, pcName } from '../../../../services/melos/theory';
import { Knob } from '../shared/Knob';
import { ARMED, PLAYHEAD, SELECT } from '../theme';

interface Props {
  arp: ArpPatch;
  /** Parameters the user can lock, gathered from the instrument's registry. */
  lockTargets: { id: number; name: string }[];
  onChange: (fn: (a: ArpPatch) => void) => void;
}

const RATES: { v: number; label: string }[] = [
  { v: 1, label: '1/4' }, { v: 2, label: '1/8' }, { v: 4, label: '1/16' }, { v: 8, label: '1/32' },
];

export const ArpPanel: React.FC<Props> = ({ arp, lockTargets, onChange }) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const setStep = useCallback((i: number, fn: (s: ArpStep) => void) => {
    onChange((a) => {
      while (a.steps.length <= i) a.steps.push(defaultStep());
      fn(a.steps[i]);
    });
  }, [onChange]);

  const len = Math.max(1, Math.min(64, arp.length));
  const step = selected !== null ? arp.steps[selected] : null;

  return (
    <div className="rounded-2xl border" style={{ borderColor: arp.enabled ? `${ARMED}59` : 'rgba(255,255,255,0.09)', background: '#0E0E12' }}>
      {/* ── header: the five controls that are the whole arp for most people ── */}
      <div className="flex items-center gap-3 px-3 h-12 flex-wrap">
        <button
          onClick={() => onChange((a) => { a.enabled = !a.enabled; })}
          className="h-7 px-3 rounded-lg text-[11px] font-semibold border transition-colors"
          style={arp.enabled
            ? { background: `${ARMED}26`, borderColor: ARMED, color: ARMED }
            : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.5)' }}
        >ARP</button>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
          Order
          <select
            value={arp.order}
            onChange={(e) => onChange((a) => { a.order = e.target.value as ArpOrder; })}
            title={ARP_ORDERS.find((o) => o.id === arp.order)?.hint}
            className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none"
          >
            {ARP_ORDERS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5">
          {RATES.map((r) => (
            <button key={r.v} onClick={() => onChange((a) => { a.rate = r.v; })}
              className={`h-6 px-2 rounded-md text-[10px] font-mono ${arp.rate === r.v ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white'}`}
            >{r.label}</button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
          Oct
          <input type="number" min={1} max={4} value={arp.octaves}
            onChange={(e) => onChange((a) => { a.octaves = Math.max(1, Math.min(4, Number(e.target.value) || 1)); })}
            className="w-11 h-7 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[11px] text-white text-center outline-none" />
        </label>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
          Gate
          <input type="range" min={5} max={150} value={Math.round(arp.gate * 100)}
            onChange={(e) => onChange((a) => { a.gate = Number(e.target.value) / 100; })}
            className="w-16 accent-[#FF8C00]" />
        </label>

        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
          Swing
          <input type="range" min={0} max={100} value={Math.round(arp.swing * 100)}
            onChange={(e) => onChange((a) => { a.swing = Number(e.target.value) / 100; })}
            className="w-16 accent-[#FF8C00]" />
        </label>

        <button
          onClick={() => onChange((a) => { a.latch = !a.latch; })}
          title="Keep playing after you let go of the keys"
          className="h-7 px-2.5 rounded-lg text-[10px] border"
          style={arp.latch
            ? { borderColor: PLAYHEAD, color: PLAYHEAD, background: `${PLAYHEAD}1a` }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
        >LATCH</button>

        <span className="flex-1" />
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {open ? 'Less' : 'More'}
        </button>
      </div>

      {!open && (
        <p className="px-3 pb-2.5 text-[10px] text-white/25">
          Hold a chord and it plays. {ARP_ORDERS.find((o) => o.id === arp.order)?.hint}
        </p>
      )}

      {open && (
        <div className="border-t border-white/[0.07] p-3 space-y-3">
          {/* ── scale guard: the "can't play a wrong note" switch ── */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => onChange((a) => { a.scale.enabled = !a.scale.enabled; })}
              className="h-7 px-2.5 rounded-lg text-[10px] border"
              style={arp.scale.enabled
                ? { borderColor: '#06D6A0', color: '#06D6A0', background: 'rgba(6,214,160,0.1)' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
              title="Transposed and wandering steps stay in key"
            >IN KEY</button>
            <select value={arp.scale.rootPc}
              onChange={(e) => onChange((a) => { a.scale.rootPc = Number(e.target.value); })}
              className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none">
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{pcName(i)}</option>)}
            </select>
            <select value={arp.scale.scaleId}
              onChange={(e) => onChange((a) => { a.scale.scaleId = e.target.value; })}
              className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none max-w-[190px]">
              {(['easy', 'core', 'colour'] as const).map((tier) => (
                <optgroup key={tier} label={tier === 'easy' ? 'Easiest' : tier === 'core' ? 'Core' : 'Colour'}>
                  {SCALES.filter((s) => s.tier === tier).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              ))}
            </select>
            <span className="text-[10px] text-white/25 flex-1 min-w-[160px]">
              {SCALES.find((s) => s.id === arp.scale.scaleId)?.character}
            </span>

            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
              Steps
              <input type="number" min={1} max={64} value={arp.length}
                onChange={(e) => onChange((a) => { a.length = Math.max(1, Math.min(64, Number(e.target.value) || 16)); })}
                className="w-12 h-7 rounded-lg bg-black/40 border border-white/10 px-1.5 text-[11px] text-white text-center outline-none" />
            </label>
          </div>

          {/* ── the step grid ── */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold">Steps</span>
              <span className="text-[9px] text-white/22">click to toggle · select to edit feel, chance and locks</span>
              <span className="flex-1" />
              <button onClick={() => onChange((a) => {
                // Euclid fills the pattern evenly — the fastest route to something that grooves.
                const pulses = Math.max(1, Math.round(a.length * 0.4));
                const e = euclidean(a.length, pulses);
                for (let i = 0; i < a.length; i++) {
                  while (a.steps.length <= i) a.steps.push(defaultStep());
                  a.steps[i].on = e[i];
                }
              })} className="h-6 px-2 rounded-lg text-[10px] border border-white/12 text-white/50 hover:text-white flex items-center gap-1">
                <Sparkles size={10} /> Euclid
              </button>
              <button onClick={() => onChange((a) => {
                for (let i = 0; i < a.length; i++) {
                  while (a.steps.length <= i) a.steps.push(defaultStep());
                  a.steps[i].velocity = 60 + Math.round(Math.random() * 60);
                  a.steps[i].micro = (Math.random() - 0.5) * 0.12;
                }
              })} className="h-6 px-2 rounded-lg text-[10px] border border-white/12 text-white/50 hover:text-white flex items-center gap-1">
                <Dices size={10} /> Humanise
              </button>
            </div>

            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(len, 16)}, minmax(0,1fr))` }}>
              {Array.from({ length: len }, (_, i) => {
                const s = arp.steps[i] || defaultStep();
                const sel = selected === i;
                const vel = s.velocity / 127;
                return (
                  <button
                    key={i}
                    onClick={(e) => { if (e.shiftKey) { setSelected(i); } else { setStep(i, (st) => { st.on = !st.on; }); setSelected(i); } }}
                    aria-label={`Arp step ${i + 1}${s.on ? ' on' : ''}`}
                    className="relative h-11 rounded-[7px] transition-colors"
                    style={{
                      background: s.on ? `rgba(255,140,0,${0.3 + vel * 0.6})` : i % 4 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.045)',
                      outline: sel ? `2px solid ${SELECT}` : 'none',
                      outlineOffset: 1,
                    }}
                  >
                    {s.ratchet > 1 && <span className="absolute top-0.5 left-1 text-[8px] font-mono text-black/70">×{s.ratchet}</span>}
                    {s.probability < 1 && <span className="absolute bottom-0.5 left-1 text-[8px] font-mono text-black/70">{Math.round(s.probability * 100)}</span>}
                    {s.condition !== 'always' && <span className="absolute top-0.5 right-1 text-[8px] font-mono text-black/70">{s.condition}</span>}
                    {s.locks.length > 0 && <Lock size={8} className="absolute bottom-0.5 right-1 text-black/70" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── the selected step ── */}
          {step && selected !== null && (
            <div className="rounded-xl border border-white/10 p-3" style={{ background: '#111116' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: SELECT }}>Step {selected + 1}</span>
                <span className="flex-1" />
                <button onClick={() => setStep(selected, (s) => Object.assign(s, defaultStep()))}
                  className="text-[10px] text-white/35 hover:text-white">Reset</button>
              </div>

              <div className="flex gap-4 flex-wrap items-start">
                <Knob label="Velocity" value={step.velocity} min={1} max={127} defaultValue={100} size={38} color={ARMED}
                  format={(v) => String(Math.round(v))} onChange={(v) => setStep(selected, (s) => { s.velocity = Math.round(v); })} />
                <Knob label="Gate" value={step.gate} min={0.05} max={2} defaultValue={0.9} size={38}
                  format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setStep(selected, (s) => { s.gate = v; })} />
                <Knob label="Ratchet" value={step.ratchet} min={1} max={8} defaultValue={1} size={38} color={PLAYHEAD}
                  format={(v) => `×${Math.round(v)}`} onChange={(v) => setStep(selected, (s) => { s.ratchet = Math.round(v); })} />
                <Knob label="Octave" value={step.octave} min={-2} max={2} defaultValue={0} size={38}
                  format={(v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)))} onChange={(v) => setStep(selected, (s) => { s.octave = Math.round(v); })} />
                <Knob label="Transpose" value={step.transpose} min={-12} max={12} defaultValue={0} size={38}
                  format={(v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)))} onChange={(v) => setStep(selected, (s) => { s.transpose = Math.round(v); })} />
                <Knob label="Chance" value={step.probability} min={0} max={1} defaultValue={1} size={38} color="#06D6A0"
                  format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setStep(selected, (s) => { s.probability = v; })} />
                <Knob label="Micro" value={step.micro} min={-0.5} max={0.5} defaultValue={0} size={38}
                  format={(v) => (Math.abs(v) < 0.01 ? 'on grid' : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`)}
                  onChange={(v) => setStep(selected, (s) => { s.micro = v; })} />

                <label className="flex flex-col gap-1 text-[9.5px] uppercase tracking-wide text-white/40">
                  Condition
                  <select value={step.condition}
                    onChange={(e) => setStep(selected, (s) => { s.condition = e.target.value as TrigCondition; })}
                    title={TRIG_CONDITIONS.find((c) => c.id === step.condition)?.hint}
                    className="h-7 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none">
                    {TRIG_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="normal-case tracking-normal text-white/25 max-w-[150px] leading-snug">
                    {TRIG_CONDITIONS.find((c) => c.id === step.condition)?.hint}
                  </span>
                </label>
              </div>

              {/* ── parameter locks: the centrepiece ── */}
              <div className="mt-3 pt-3 border-t border-white/[0.07]">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lock size={10} style={{ color: SELECT }} />
                  <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/40 font-semibold">Locks</span>
                  <span className="text-[9px] text-white/22">this step holds these values, then hands them back</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {step.locks.map((lock, li) => (
                    <div key={li} className="flex items-center gap-2">
                      <select value={lock.paramId}
                        onChange={(e) => setStep(selected, (s) => { s.locks[li].paramId = Number(e.target.value); })}
                        className="h-7 flex-1 rounded-lg bg-black/40 border border-white/10 px-2 text-[11px] text-white outline-none">
                        {lockTargets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <input type="range" min={0} max={100} value={Math.round(lock.value * 100)}
                        onChange={(e) => setStep(selected, (s) => { s.locks[li].value = Number(e.target.value) / 100; })}
                        className="w-28 accent-[#D40055]" />
                      <span className="font-mono text-[10px] text-white/45 w-8">{Math.round(lock.value * 100)}</span>
                      <button onClick={() => setStep(selected, (s) => { s.locks.splice(li, 1); })}
                        aria-label="Remove lock" className="w-6 h-6 grid place-items-center rounded text-white/25 hover:text-[#EF4444]">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  {step.locks.length < 4 && lockTargets.length > 0 && (
                    <button
                      onClick={() => setStep(selected, (s) => { s.locks.push({ paramId: lockTargets[0].id, value: 0.5 }); })}
                      className="h-7 self-start px-2.5 rounded-lg text-[10px] border border-white/12 text-white/45 hover:text-white"
                    >+ Lock a parameter</button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
