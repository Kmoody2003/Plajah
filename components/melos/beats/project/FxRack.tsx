// The FX rack — one component behind the per-track insert strip AND the unified master Suite.
//
// Renders a serializable FxInstance[] as a stack of devices (Ozone/RX-style): add from a
// grouped menu, bypass, reorder, remove, and edit params on knobs drawn straight from each
// device's descriptor. Controlled: every edit calls onChange(next) with a fresh array, which
// the caller persists to the doc and pushes to the live chain (the SpectraPanel two-writer
// pattern). No audio here — this is the surface; devices.ts is the sound.

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Power, Trash2, Plus, X } from 'lucide-react';
import { DEVICES, deviceByType, newInstance, type FxInstance, type FxCategory, type FxNode } from '../../../../services/melos/beats/fx/devices';
import { FxScope } from './FxScope';
import { AmpRigEditor } from './AmpRigEditor';
import { Knob } from '../shared/Knob';

const CAT_LABEL: Record<FxCategory, string> = {
  eq: 'EQ', dynamics: 'Dynamics', saturation: 'Saturation', stereo: 'Stereo', space: 'Space', repair: 'Repair', utility: 'Utility', amp: 'Amps & Rigs',
};
const CAT_ORDER: FxCategory[] = ['amp', 'eq', 'dynamics', 'saturation', 'stereo', 'space', 'repair', 'utility'];

interface FxRackProps {
  instances: FxInstance[];
  onChange: (next: FxInstance[]) => void;
  /** Fallback accent when a row is collapsed. */
  accent?: string;
  /** Live gain-reduction lookup for a compressor device, keyed by instance id. */
  reductionOf?: (id: string) => number;
  /** Live device lookup — lets each scope read that device's own pre/post analysers. */
  nodeOf?: (id: string) => FxNode | undefined;
  title?: string;
  emptyHint?: string;
  /** Chain devices left-to-right as cards (Bitwig device row) instead of a vertical stack. */
  horizontal?: boolean;
}

export const FxRack: React.FC<FxRackProps> = ({ instances, onChange, accent = '#D0BCFF', reductionOf, nodeOf, title, emptyHint, horizontal }) => {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const add = (type: string) => {
    const inst = newInstance(type);
    if (!inst) return;
    onChange([...instances, inst]);
    setOpenId(inst.id);
    setAdding(false);
  };
  const patch = (id: string, fn: (i: FxInstance) => FxInstance) => onChange(instances.map((i) => (i.id === id ? fn(i) : i)));
  /** Merge several params at once — what a rig preset or a multi-control editor writes. */
  const patch2 = (id: string, params: Record<string, number>) =>
    patch(id, (x) => ({ ...x, params: { ...x.params, ...params } }));
  const move = (id: string, dir: -1 | 1) => {
    const idx = instances.findIndex((i) => i.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= instances.length) return;
    const next = [...instances];
    const [x] = next.splice(idx, 1); next.splice(to, 0, x);
    onChange(next);
  };
  const remove = (id: string) => { onChange(instances.filter((i) => i.id !== id)); if (openId === id) setOpenId(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {title && <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">{title}</span>}
        <div className="relative ml-auto">
          <button
            onClick={() => setAdding((v) => !v)}
            className="h-6 px-2.5 rounded-lg text-[10px] font-semibold border border-white/15 text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1"
          ><Plus size={11} /> Add FX</button>
          {adding && (
            <div className="absolute right-0 top-7 z-30 w-56 max-h-[320px] overflow-auto rounded-[12px] border border-white/15 bg-[#12101a] shadow-2xl p-1.5">
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-white/30">Device Library</span>
                <button onClick={() => setAdding(false)} className="text-white/30 hover:text-white"><X size={12} /></button>
              </div>
              {CAT_ORDER.map((cat) => {
                const devs = DEVICES.filter((d) => d.category === cat);
                if (!devs.length) return null;
                return (
                  <div key={cat} className="mb-1">
                    <div className="px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.16em]" style={{ color: devs[0].color }}>{CAT_LABEL[cat]}</div>
                    {devs.map((d) => (
                      <button
                        key={d.type}
                        onClick={() => add(d.type)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/[0.07] flex flex-col"
                      >
                        <span className="text-[11px] font-bold text-white">{d.label}</span>
                        <span className="text-[9px] text-white/40 truncate">{d.blurb}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {instances.length === 0 && (
        <div className="py-3 text-center text-[10.5px] text-white/25 border border-dashed border-white/10 rounded-[10px]">
          {emptyHint ?? 'No inserts — add EQ, dynamics, saturation, repair…'}
        </div>
      )}

      <div className={horizontal ? 'flex flex-row gap-0 items-start overflow-x-auto pb-1' : 'flex flex-col gap-1.5'}>
        {instances.map((inst, i) => {
          const d = deviceByType(inst.type);
          if (!d) return null;
          const open = openId === inst.id;
          const gr = reductionOf ? reductionOf(inst.id) : 0; // de-ess reports GR too, not just dynamics
          // In a horizontal chain, a wide card for the amp rack, standard otherwise; the signal
          // flows left-to-right with an arrow between devices.
          const cardW = horizontal ? (open ? (inst.type === 'amprig' ? 440 : 300) : 168) : undefined;
          return (
            <React.Fragment key={inst.id}>
            {horizontal && i > 0 && <span className="self-center px-1 text-white/25 flex-none" style={{ color: `${accent}88` }}>▶</span>}
            <div className={`rounded-[10px] border ${horizontal ? 'flex-none' : ''}`} style={{ borderColor: open ? `${d.color}66` : 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', width: cardW }}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: inst.on ? d.color : 'rgba(255,255,255,0.2)' }} />
                <button onClick={() => setOpenId(open ? null : inst.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-[11.5px] font-bold text-white truncate" style={{ opacity: inst.on ? 1 : 0.4 }}>{d.label}</div>
                </button>
                {gr < -0.1 && <span className="font-mono text-[8.5px] text-[#FF8C00]">GR {gr.toFixed(1)}</span>}
                <button onClick={() => move(inst.id, -1)} disabled={i === 0} className="text-white/25 hover:text-white disabled:opacity-15" aria-label="Move up"><ChevronUp size={11} /></button>
                <button onClick={() => move(inst.id, 1)} disabled={i === instances.length - 1} className="text-white/25 hover:text-white disabled:opacity-15" aria-label="Move down"><ChevronDown size={11} /></button>
                <button
                  onClick={() => patch(inst.id, (x) => ({ ...x, on: !x.on }))}
                  className="w-5 h-5 grid place-items-center rounded-md"
                  style={{ color: inst.on ? d.color : 'rgba(255,255,255,0.25)' }}
                  aria-label={inst.on ? `Bypass ${d.label}` : `Enable ${d.label}`}
                ><Power size={11} /></button>
                <button onClick={() => remove(inst.id)} className="w-5 h-5 grid place-items-center rounded-md text-white/20 hover:text-[#EF4444]" aria-label={`Remove ${d.label}`}><Trash2 size={11} /></button>
              </div>
              {open && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] text-white/35">{d.blurb}</span>
                    <span className="flex items-center gap-2 text-[7.5px] uppercase tracking-[0.14em]">
                      <span className="flex items-center gap-1 text-white/30"><i className="w-2 h-1.5 rounded-sm inline-block bg-white/25" /> in</span>
                      <span className="flex items-center gap-1" style={{ color: d.color }}><i className="w-2 h-[2px] rounded-sm inline-block" style={{ background: d.color }} /> out</span>
                    </span>
                  </div>
                  {/* The before/after picture — OG spectrum filled, affected spectrum on top. */}
                  <FxScope
                    node={nodeOf?.(inst.id)}
                    type={inst.type}
                    params={inst.params}
                    color={d.color}
                    category={d.category}
                    gr={gr}
                  />
                  {/* The amp rack gets a backline, not a knob grid. */}
                  {inst.type === 'amprig' ? (
                    <div className="mt-2.5">
                      <AmpRigEditor
                        params={inst.params}
                        color={d.color}
                        onChange={(patch) => patch2(inst.id, patch)}
                      />
                    </div>
                  ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-3 mt-2.5">
                    {d.params.map((sp) => (
                      <Knob
                        key={sp.key}
                        label={sp.label}
                        value={inst.params[sp.key] ?? sp.default}
                        min={sp.min}
                        max={sp.max}
                        defaultValue={sp.default}
                        color={d.color}
                        size={34}
                        format={(v) => (sp.format ? sp.format(v) : `${v.toFixed(sp.step === 1 ? 0 : 1)}${sp.unit ? ` ${sp.unit}` : ''}`)}
                        onChange={(v) => patch(inst.id, (x) => ({ ...x, params: { ...x.params, [sp.key]: sp.step === 1 ? Math.round(v) : v } }))}
                      />
                    ))}
                  </div>
                  )}
                </div>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
