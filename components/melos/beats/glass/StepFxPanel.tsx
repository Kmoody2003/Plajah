// Step Effects (feature 2) — build per-pad FX "slots" and assign steps to them, in Glass.
//
// The connection, resolved: a pad carries a small bounded set of step-FX slots (a device chain +
// an optional send-bus target). A step references a slot by index (Step.fx); when that step
// fires, its voice runs through the slot's chain (and to the send) instead of dry. Bounded slots
// keep the graph cheap — you define a few treatments and paint steps onto them. The mixer's
// per-pad Step-FX switch (pad.stepFxOn) master-bypasses the lot.

import React, { useState } from 'react';
import { Plus, X, Play } from 'lucide-react';
import type { GrooveDoc, Pattern, StepFxSlot } from '../../../../services/melos/beats/grooveDoc';
import { defaultSendBuses } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import type { FxInstance } from '../../../../services/melos/beats/fx/devices';
import { FxRack } from '../project/FxRack';
import { SELECT, PLAYHEAD } from '../theme';

const uid = () => `sfx${Math.random().toString(36).slice(2, 8)}`;
const SLOT_COLORS = ['#D40055', '#FF8C00', '#00DAF3', '#06D6A0'];

interface Props {
  doc: GrooveDoc;
  pattern: Pattern;
  padIdx: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const StepFxPanel: React.FC<Props> = ({ doc, pattern, padIdx, onMutate }) => {
  const [slotIdx, setSlotIdx] = useState(0);
  const pad = doc.kit[padIdx];
  const slots = pad?.stepFx ?? [];
  const sendBuses = doc.mixer.sendBuses ?? defaultSendBuses();
  const cols = Math.min(pattern.length, 16);
  const row = pattern.steps[padIdx] || {};
  const slot = slots[slotIdx];
  const on = pad?.stepFxOn !== false;

  const editPad = (fn: (p: NonNullable<typeof pad>) => void) => onMutate((d) => { const p = d.kit[padIdx]; if (p) fn(p); });
  const addSlot = () => { editPad((p) => { p.stepFx = [...(p.stepFx ?? []), { id: uid(), name: `FX ${(p.stepFx?.length ?? 0) + 1}`, chain: [] }]; }); setSlotIdx(slots.length); };
  const editSlot = (fn: (s: StepFxSlot) => void) => editPad((p) => { const s = p.stepFx?.[slotIdx]; if (s) fn(s); });
  const removeSlot = () => { editPad((p) => { p.stepFx = (p.stepFx ?? []).filter((_, i) => i !== slotIdx); }); setSlotIdx(0); };
  const assignStep = (c: number) => onMutate((d) => {
    const pat = d.patterns.find((p) => p.id === pattern.id); if (!pat) return;
    const r = pat.steps[padIdx] || (pat.steps[padIdx] = {});
    if (!r[c]) r[c] = { v: 100 };
    r[c].fx = r[c].fx === slotIdx ? undefined : slotIdx; // toggle assignment to the current slot
  });

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Step Effects · {pad?.name}</span>
        <button
          onClick={() => editPad((p) => { p.stepFxOn = p.stepFxOn === false; })}
          className="h-6 px-2.5 rounded-lg text-[9.5px] font-bold border"
          style={on ? { color: SELECT, borderColor: `${SELECT}66` } : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.15)' }}
        >{on ? 'STEP FX ON' : 'STEP FX OFF'}</button>
        <span className="ml-auto text-[9px] text-white/25">the mixer mirrors this switch + a jump back here</span>
      </div>

      {slots.length === 0 ? (
        <button onClick={addSlot} className="w-full py-4 rounded-[12px] border border-dashed border-white/12 text-[11px] text-white/40 hover:text-white hover:border-white/25 flex items-center justify-center gap-1.5">
          <Plus size={13} /> Create a step-FX slot — then paint steps onto it
        </button>
      ) : (
        <>
          {/* slot tabs */}
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {slots.map((s, i) => (
              <button key={s.id} onClick={() => setSlotIdx(i)} className="h-7 px-3 rounded-lg text-[11px] font-bold border"
                style={i === slotIdx ? { color: '#fff', borderColor: SLOT_COLORS[i % 4], background: `${SLOT_COLORS[i % 4]}1a` } : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}>
                {s.name}
              </button>
            ))}
            <button onClick={addSlot} className="w-7 h-7 grid place-items-center rounded-lg border border-white/12 text-white/40 hover:text-white"><Plus size={12} /></button>
          </div>

          {slot && (
            <>
              {/* slot header: name + send routing */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <input value={slot.name} onChange={(e) => editSlot((s) => { s.name = e.target.value; })}
                  className="h-7 px-2 rounded-lg bg-black/35 border border-white/10 text-[11px] text-white outline-none w-28" aria-label="Slot name" />
                <span className="text-[10px] text-white/40">send to</span>
                <select value={slot.sendBus ?? ''} onChange={(e) => editSlot((s) => { s.sendBus = e.target.value === '' ? undefined : Number(e.target.value); })}
                  className="h-7 rounded-lg bg-black/40 border border-white/10 text-[10.5px] text-white/80 px-1.5 outline-none" aria-label="Slot send bus">
                  <option value="">no send</option>
                  {sendBuses.map((b, i) => <option key={i} value={i}>{b.name}</option>)}
                </select>
                {slot.sendBus !== undefined && (
                  <input type="range" min={0} max={1.5} step={0.01} value={slot.sendLevel ?? 0.5}
                    onChange={(e) => editSlot((s) => { s.sendLevel = Number(e.target.value); })} className="w-20 accent-[#06D6A0]" aria-label="Send level" />
                )}
                <button
                  onClick={() => { const e = BeatsEngine.get(); void e.init().then(() => e.trigger(padIdx, 112, undefined, undefined, 0, undefined, slotIdx)); }}
                  className="ml-auto h-7 px-2.5 rounded-lg text-[10px] font-bold border flex items-center gap-1.5"
                  style={{ borderColor: `${SLOT_COLORS[slotIdx % 4]}66`, color: SLOT_COLORS[slotIdx % 4] }}
                  title="Play this pad through the slot — you hear the FX and the scope lights up"
                ><Play size={11} fill="currentColor" /> Audition</button>
                <button onClick={removeSlot} className="w-6 h-6 grid place-items-center rounded-md text-white/25 hover:text-[#EF4444]" aria-label="Remove slot"><X size={13} /></button>
              </div>

              {/* the slot's device chain */}
              <FxRack
                horizontal
                instances={slot.chain ?? []}
                onChange={(next: FxInstance[]) => editSlot((s) => { s.chain = next; })}
                accent={SLOT_COLORS[slotIdx % 4]}
                nodeOf={(id) => BeatsEngine.get().stepFxNode(padIdx, slot.id, id)}
                emptyHint="Add effects — this whole chain runs only on the steps you assign to this slot."
              />

              {/* step assignment row */}
              <div className="mt-3">
                <span className="text-[9px] uppercase tracking-[0.16em] text-white/25">Assign steps to {slot.name}</span>
                <div className="grid gap-[4px] mt-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                  {Array.from({ length: cols }, (_, c) => {
                    const st = row[c];
                    const assigned = st?.fx;
                    const isThis = assigned === slotIdx;
                    return (
                      <button key={c} onClick={() => assignStep(c)}
                        className="h-[26px] rounded-[6px] border text-[8px] font-bold grid place-items-center transition-colors"
                        style={{
                          background: st ? (isThis ? SLOT_COLORS[slotIdx % 4] : c % 4 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)') : 'transparent',
                          borderColor: st ? 'transparent' : 'rgba(255,255,255,0.06)',
                          color: isThis ? '#0a0a0d' : assigned !== undefined ? SLOT_COLORS[assigned % 4] : 'rgba(255,255,255,0.3)',
                          outline: c === 0 ? 'none' : 'none',
                        }}
                        title={st ? (isThis ? `Assigned to ${slot.name}` : assigned !== undefined ? `Assigned to slot ${assigned + 1}` : 'Dry — click to assign') : 'No step here'}
                      >{assigned !== undefined ? assigned + 1 : ''}</button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-white/25 mt-1.5">Click a step to route it through <b style={{ color: SLOT_COLORS[slotIdx % 4] }}>{slot.name}</b> — click again to make it dry. A number shows which slot each step uses.</p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
