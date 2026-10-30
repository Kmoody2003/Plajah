// The note-FX rack: the chain a track or pad plays through, on drawn notes and played ones alike.
// Drawn from the NOTE_FX table, so a new device needs no UI work.

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { NOTE_FX, newNoteFxDevice, noteFxDef, ownerArp, type NoteFxDevice, type NoteFxKind, type NoteFxOwner, type NoteFxParamSpec } from '../../../../services/melos/beats/noteFx';
import { ARP_ORDERS, defaultArpPatch, type ArpOrder, type ArpPatch } from '../../../../services/melos/arp';

export type NoteFxTarget = { trackId: string } | { padIdx: number };

interface Props {
  doc: GrooveDoc;
  target: NoteFxTarget;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

/** A pad's chain lives on its instrument when it has one. */
export function ownerOf(d: GrooveDoc, target: NoteFxTarget): (NoteFxOwner & { patch?: Record<string, unknown> }) | null {
  if ('trackId' in target) return d.arrangement.find((t) => t.id === target.trackId)?.instrument ?? null;
  const pad = d.kit[target.padIdx];
  if (!pad) return null;
  if (pad.source === 'instrument' && pad.instrumentTrackId) return d.arrangement.find((t) => t.id === pad.instrumentTrackId)?.instrument ?? null;
  return pad;
}

const ARP_RATES = [{ v: 1, l: '1/4' }, { v: 2, l: '1/8' }, { v: 3, l: '1/8T' }, { v: 4, l: '1/16' }, { v: 6, l: '1/16T' }, { v: 8, l: '1/32' }];

const inputCls = 'h-6 rounded-md bg-black/40 border border-white/10 px-1 text-[10px] text-white/80 outline-none';

const ParamControl: React.FC<{ spec: NoteFxParamSpec; value: number | string; onChange: (v: number | string) => void }> = ({ spec, value, onChange }) => {
  if (spec.key === 'pattern') {
    const pat = String(value || 'xxxxxxxx').padEnd(8, 'x').slice(0, 8);
    return (
      <span className="flex items-center gap-0.5" title="Gate pattern: click a cell to close it">
        {pat.split('').map((c, i) => (
          <button key={i} aria-label={`Gate cell ${i + 1}`} aria-pressed={c !== '-'}
            onClick={() => onChange(pat.slice(0, i) + (c === '-' ? 'x' : '-') + pat.slice(i + 1))}
            className="w-3.5 h-5 rounded-sm" style={{ background: c === '-' ? 'rgba(255,255,255,0.08)' : '#D0BCFF' }} />
        ))}
      </span>
    );
  }
  if (spec.choices) {
    return (
      <label className="flex items-center gap-1 text-[9.5px] text-white/40">{spec.label}
        <select value={String(value)} onChange={(e) => {
          const c = spec.choices!.find((x) => String(x.value) === e.target.value);
          if (c) onChange(c.value);
        }} className={inputCls}>
          {spec.choices.map((c) => <option key={String(c.value)} value={String(c.value)}>{c.label}</option>)}
        </select>
      </label>
    );
  }
  const n = typeof value === 'number' ? value : Number(spec.default);
  return (
    <label className="flex items-center gap-1 text-[9.5px] text-white/40">{spec.label}
      <input type="range" min={spec.min} max={spec.max} step={spec.step} value={n} onChange={(e) => onChange(Number(e.target.value))} className="w-16 accent-[#D0BCFF]" />
      <span className="font-mono text-white/55 w-7">{Number.isInteger(n) ? n : n.toFixed(2)}</span>
    </label>
  );
};

export const NoteFxRack: React.FC<Props> = ({ doc, target, onMutate }) => {
  const owner = ownerOf(doc, target);
  if (!owner) return null;
  const devices = owner.noteFx ?? [];
  const arp: ArpPatch = ownerArp(owner, owner.patch) ?? { ...defaultArpPatch(), ...((owner.arp ?? {}) as Partial<ArpPatch>) };
  const arpOn = !!ownerArp(owner, owner.patch);

  const edit = (fn: (o: NoteFxOwner & { patch?: Record<string, unknown> }) => void) => onMutate((d) => {
    const o = ownerOf(d, target);
    if (o) fn(o);
  });
  const editArp = (fn: (a: ArpPatch) => void) => edit((o) => {
    // AURA's own arp block hands over to the shared one the first time it's edited here.
    const next: ArpPatch = { ...arp, steps: arp.steps.map((s) => ({ ...s, locks: [...s.locks] })) };
    fn(next);
    o.arp = next as unknown as Record<string, unknown>;
    const aura = o.patch?.arp as { enabled?: boolean } | undefined;
    if (aura?.enabled) aura.enabled = false;
  });
  const editDevice = (id: string, fn: (x: NoteFxDevice) => void) => edit((o) => {
    const x = o.noteFx?.find((v) => v.id === id);
    if (x) fn(x);
  });

  return (
    <div className="rounded-xl border border-white/10 p-2 flex flex-col gap-1.5" style={{ background: '#0F0F14' }} data-testid="note-fx-rack">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40 font-semibold">Note FX</span>
        <span className="text-[9px] text-white/25">on drawn notes, steps and playing</span>
        <span className="flex-1" />
        <label className="flex items-center gap-1 text-[9.5px] text-white/40"><Plus size={10} />
          <select value="" aria-label="Add a note effect" onChange={(e) => {
            const kind = e.target.value as NoteFxKind;
            if (kind) edit((o) => { (o.noteFx ??= []).push(newNoteFxDevice(kind)); });
          }} className={inputCls}>
            <option value="">Add…</option>
            {NOTE_FX.map((d) => <option key={d.kind} value={d.kind} title={d.hint}>{d.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1 border border-white/[0.07]">
        <button onClick={() => editArp((a) => { a.enabled = !arpOn; })} aria-pressed={arpOn}
          className="h-6 px-2 rounded-md text-[10px] font-semibold border"
          style={arpOn ? { borderColor: '#FF8C00', color: '#FF8C00', background: 'rgba(255,140,0,0.12)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>Arp</button>
        {arpOn && (
          <>
            <select value={arp.order} aria-label="Arp order" onChange={(e) => editArp((a) => { a.order = e.target.value as ArpOrder; })} className={inputCls}>
              {ARP_ORDERS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select value={arp.rate} aria-label="Arp rate" onChange={(e) => editArp((a) => { a.rate = Number(e.target.value); })} className={inputCls}>
              {ARP_RATES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[9.5px] text-white/40">Oct
              <input type="number" min={1} max={4} value={arp.octaves} onChange={(e) => editArp((a) => { a.octaves = Math.max(1, Math.min(4, Number(e.target.value) || 1)); })} className={`${inputCls} w-9`} />
            </label>
            <label className="flex items-center gap-1 text-[9.5px] text-white/40">Gate
              <input type="range" min={5} max={150} value={Math.round(arp.gate * 100)} onChange={(e) => editArp((a) => { a.gate = Number(e.target.value) / 100; })} className="w-14 accent-[#FF8C00]" />
            </label>
            <label className="flex items-center gap-1 text-[9.5px] text-white/40">Swing
              <input type="range" min={0} max={100} value={Math.round(arp.swing * 100)} onChange={(e) => editArp((a) => { a.swing = Number(e.target.value) / 100; })} className="w-14 accent-[#FF8C00]" />
            </label>
          </>
        )}
      </div>

      {devices.map((dev) => {
        const def = noteFxDef(dev.kind);
        if (!def) return null;
        return (
          <div key={dev.id} className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1 border border-white/[0.07]">
            <button onClick={() => editDevice(dev.id, (x) => { x.on = !x.on; })} aria-pressed={dev.on} title={def.hint}
              className="h-6 px-2 rounded-md text-[10px] font-semibold border"
              style={dev.on ? { borderColor: '#D0BCFF', color: '#D0BCFF', background: 'rgba(208,188,255,0.12)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>{def.name}</button>
            {def.params.map((s) => (
              <ParamControl key={s.key} spec={s} value={dev.params[s.key] ?? s.default} onChange={(v) => editDevice(dev.id, (x) => { x.params[s.key] = v; })} />
            ))}
            <span className="flex-1" />
            <button onClick={() => edit((o) => { o.noteFx = o.noteFx?.filter((x) => x.id !== dev.id); })} aria-label={`Remove ${def.name}`} className="w-5 h-5 grid place-items-center rounded text-white/25 hover:text-[#EF4444]"><Trash2 size={10} /></button>
          </div>
        );
      })}
    </div>
  );
};
