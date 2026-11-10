// The FX rack — one component behind the per-track insert strip AND the unified master Suite.
//
// Renders a serializable FxInstance[] as a stack of devices (Ozone/RX-style): add from a
// grouped menu, bypass, reorder, remove, and edit params on knobs drawn straight from each
// device's descriptor. Controlled: every edit calls onChange(next) with a fresh array, which
// the caller persists to the doc and pushes to the live chain (the SpectraPanel two-writer
// pattern). No audio here — this is the surface; devices.ts is the sound.

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Power, Trash2, Plus } from 'lucide-react';
import { deviceByType, newInstance, type FxInstance, type FxNode } from '../../../../services/melos/beats/fx/devices';
import { DeviceBrowser } from './DeviceBrowser';
import { FxScope } from './FxScope';
import { AmpRigEditor } from './AmpRigEditor';
import { StutterGrid } from './StutterGrid';
import { IrPicker } from './IrPicker';
import { Knob } from '../shared/Knob';
import { presetsForFx } from '../../../../services/melos/beats/fx/presets';

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
  // null = browser closed; a number = the chain slot the device will be inserted at.
  const [addAt, setAddAt] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Horizontal chains can fold a device to its header (Bitwig's collapsed device).
  const [folded, setFolded] = useState<Set<string>>(new Set());

  const add = (type: string) => {
    const inst = newInstance(type);
    if (!inst) return;
    const at = addAt === null ? instances.length : Math.max(0, Math.min(instances.length, addAt));
    const next = [...instances];
    next.splice(at, 0, inst);
    onChange(next);
    setOpenId(inst.id);
    setFolded((f) => { const n = new Set(f); n.delete(inst.id); return n; });
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
      {(title || !horizontal) && (
        <div className="flex items-center justify-between mb-2">
          {title && <span className="text-[10px] font-extrabold tracking-[0.18em] uppercase text-white/35">{title}</span>}
          <button
            onClick={() => setAddAt(instances.length)}
            className="ml-auto h-6 px-2.5 rounded-lg text-[10px] font-semibold border border-white/15 text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1"
          ><Plus size={11} /> Add device</button>
        </div>
      )}
      <DeviceBrowser
        open={addAt !== null}
        onClose={() => setAddAt(null)}
        onPick={add}
        context={addAt !== null ? `Insert at slot ${addAt + 1} of ${instances.length + 1}` : undefined}
      />

      {instances.length === 0 && (
        <button
          onClick={() => setAddAt(0)}
          className="w-full py-5 text-center text-[11px] text-white/35 hover:text-white/80 border border-dashed border-white/15 hover:border-white/35 rounded-[10px] flex flex-col items-center gap-1 transition-colors"
        >
          <Plus size={16} />
          {emptyHint ?? 'No inserts — add EQ, dynamics, saturation, repair…'}
        </button>
      )}

      <div className={horizontal ? 'flex flex-row gap-0 items-start overflow-x-auto pb-1' : 'flex flex-col gap-1.5'}>
        {instances.map((inst, i) => {
          const d = deviceByType(inst.type);
          if (!d) return null;
          const presets = presetsForFx(inst.type);
          // A horizontal device row is the whole signal chain, not an accordion: every device
          // stays visible while another is edited (Bitwig-style left-to-right workflow).
          const open = horizontal ? !folded.has(inst.id) : openId === inst.id;
          const gr = reductionOf ? reductionOf(inst.id) : 0; // de-ess reports GR too, not just dynamics
          // In a horizontal chain, a wide card for the amp rack, standard otherwise; the signal
          // flows left-to-right with an arrow between devices.
          const cardW = horizontal ? (open ? (inst.type === 'amprig' ? 440 : 300) : 168) : undefined;
          return (
            <React.Fragment key={inst.id}>
            {horizontal && i > 0 && (
              <button
                onClick={() => setAddAt(i)}
                className="group self-stretch w-5 flex-none flex items-center justify-center"
                title="Insert a device here"
                aria-label={`Insert a device before ${d.label}`}
              >
                <span className="group-hover:hidden text-[10px]" style={{ color: `${accent}88` }}>▶</span>
                <span className="hidden group-hover:grid w-5 h-5 place-items-center rounded-full bg-white/15 text-white"><Plus size={11} /></span>
              </button>
            )}
            <div className={`rounded-[10px] border ${horizontal ? 'flex-none' : ''}`} style={{ borderColor: open ? `${d.color}66` : 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)', width: cardW }}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: inst.on ? d.color : 'rgba(255,255,255,0.2)' }} />
                <button onClick={() => { if (horizontal) setFolded((f) => { const n = new Set(f); if (n.has(inst.id)) n.delete(inst.id); else n.add(inst.id); return n; }); else setOpenId(open ? null : inst.id); }} className="flex-1 min-w-0 text-left" title={horizontal ? (open ? 'Fold device' : 'Unfold device') : undefined}>
                  <div className="text-[11.5px] font-bold text-white truncate" style={{ opacity: inst.on ? 1 : 0.4 }}>{d.label}</div>
                </button>
                {gr < -0.1 && <span className="font-mono text-[8.5px] text-[#FF8C00]">GR {gr.toFixed(1)}</span>}
                <button onClick={() => move(inst.id, -1)} disabled={i === 0} className="text-white/25 hover:text-white disabled:opacity-15" aria-label={horizontal ? 'Move left' : 'Move up'}>{horizontal ? <ChevronLeft size={11} /> : <ChevronUp size={11} />}</button>
                <button onClick={() => move(inst.id, 1)} disabled={i === instances.length - 1} className="text-white/25 hover:text-white disabled:opacity-15" aria-label={horizontal ? 'Move right' : 'Move down'}>{horizontal ? <ChevronRight size={11} /> : <ChevronDown size={11} />}</button>
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
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[9px] text-white/35">{d.blurb}</span>
                    {presets.length > 0 && (
                      <select
                        aria-label={`${d.label} preset`}
                        defaultValue=""
                        onChange={(e) => {
                          const selected = presets.find((preset) => preset.id === e.target.value);
                          if (selected) patch2(inst.id, selected.params);
                          e.currentTarget.value = '';
                        }}
                        className="min-w-0 max-w-[132px] h-6 rounded-md border border-white/10 bg-black/30 px-1.5 text-[9px] text-white/65"
                        title="Load a factory preset"
                      >
                        <option value="" disabled>Factory presets</option>
                        {presets.map((preset) => <option key={preset.id} value={preset.id} title={preset.description}>{preset.name}</option>)}
                      </select>
                    )}
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
                    onParamsChange={(params) => patch(inst.id, (x) => ({ ...x, params: { ...x.params, ...params } }))}
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
                  ) : inst.type === 'stutter' ? (
                    <StutterGrid params={inst.params} paramSpecs={d.params} color={d.color} onChange={(patch) => patch2(inst.id, patch)} />
                  ) : (
                  <>
                  {/* Reverbs get a Source picker (modelled vs recorded IR); its raw irMode/irIndex knobs
                      are hidden, and the modelled-only knobs drop out once a library IR is chosen. */}
                  {(inst.type === 'spaces' || inst.type === 'cosmos') && (
                    <IrPicker params={inst.params} color={d.color} onChange={(patch) => patch2(inst.id, patch)} />
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-3 mt-2.5">
                    {d.params.filter((sp) => {
                      if (inst.type !== 'spaces' && inst.type !== 'cosmos') return true;
                      if (sp.key === 'irMode' || sp.key === 'irIndex') return false;
                      const library = (inst.params.irMode ?? 0) > 0.5;
                      if (library && (sp.key === 'space' || sp.key === 'size' || sp.key === 'damp')) return false;
                      return true;
                    }).map((sp) => (
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
                  </>
                  )}
                </div>
              )}
            </div>
            </React.Fragment>
          );
        })}
        {horizontal && instances.length > 0 && (
          <button
            onClick={() => setAddAt(instances.length)}
            className="ml-2 flex-none self-stretch min-h-[120px] w-[120px] rounded-[10px] border border-dashed border-white/15 hover:border-white/40 text-white/35 hover:text-white flex flex-col items-center justify-center gap-1.5 text-[10.5px] font-semibold transition-colors"
            title="Add a device at the end of the chain"
          ><Plus size={18} /> Add device</button>
        )}
      </div>
    </div>
  );
};
