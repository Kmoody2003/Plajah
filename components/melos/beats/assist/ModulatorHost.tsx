// Parameter animation's front door. Right-click ANY knob: the host nudges it, watches what it wrote
// (an engine parameter, a macro, a mixer or FX value in the doc), and attaches a modulator to that.
// No knob had to be told its parameter id. The rack below edits everything that's moving.

import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Waves, X } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import {
  CURVES, WAVES, curveById, diffNumericLeaves, knobBridge, modCapture, modulatorAmount, newModulator, targetFromPath, waveById,
  type KnobRequest, type ModTarget, type Modulator, type ParamLink,
} from '../../../../services/melos/beats/modulators';
import { deviceByType } from '../../../../services/melos/beats/fx/devices';
import { targetSpec } from '../../../../services/melos/beats/automation';

interface Props {
  doc: GrooveDoc;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

const SYNC = [
  { v: 0, l: 'Free' }, { v: 16, l: '4 bars' }, { v: 8, l: '2 bars' }, { v: 4, l: '1 bar' }, { v: 2, l: '1/2' }, { v: 1, l: '1/4' },
  { v: 0.5, l: '1/8' }, { v: 1 / 3, l: '1/8T' }, { v: 0.25, l: '1/16' }, { v: 0.125, l: '1/32' },
];
const selectCls = 'h-6 rounded-md bg-black/40 border border-white/10 px-1 text-[10px] text-white/80 outline-none';

/** Every target with a fixed list: channel controls and FX params. Knobs reach instrument params. */
function pickableTargets(doc: GrooveDoc): { group: string; label: string; target: ModTarget; min: number; max: number }[] {
  const out: { group: string; label: string; target: ModTarget; min: number; max: number }[] = [];
  const fxOf = (group: string, scope: 'track' | 'pad' | 'group' | 'send', owner: string, inserts: { id: string; type: string }[] | undefined) => {
    for (const fx of inserts ?? []) {
      const d = deviceByType(fx.type);
      for (const p of d?.params ?? []) {
        out.push({ group, label: `${d!.label} · ${p.label}`, target: { kind: 'fx', scope, owner, fxId: fx.id, param: p.key }, min: p.min, max: p.max });
      }
    }
  };
  for (const t of doc.arrangement) {
    if (t.foreign || t.kind === 'pattern') continue;
    const group = t.name;
    const mix = t.kind === 'instrument'
      ? [{ kind: 'volume' }, { kind: 'pan' }, { kind: 'send', index: 0 }, { kind: 'send', index: 1 }, ...Array.from({ length: 8 }, (_, i) => ({ kind: 'macro', index: i })), { kind: 'mod-wheel' }, { kind: 'expression' }, { kind: 'pitch-bend' }]
      : [{ kind: 'volume' }, { kind: 'pan' }, { kind: 'send', index: 0 }, { kind: 'send', index: 1 }];
    for (const raw of mix) {
      const target = raw as Extract<ModTarget, { kind: 'track' }>['target'];
      const s = targetSpec(target);
      out.push({ group, label: s.label, target: { kind: 'track', trackId: t.id, target }, min: target.kind === 'volume' ? -24 : s.min, max: target.kind === 'volume' ? 0 : s.max });
    }
    fxOf(group, 'track', t.id, t.inserts);
  }
  doc.kit.forEach((pad, i) => {
    if (pad.empty) return;
    const group = `Pad ${i + 1} ${pad.name}`;
    out.push({ group, label: 'Level', target: { kind: 'pad', padIdx: i, field: 'gainDb' }, min: -24, max: 0 });
    out.push({ group, label: 'Pan', target: { kind: 'pad', padIdx: i, field: 'pan' }, min: -1, max: 1 });
    fxOf(group, 'pad', String(i), pad.inserts);
  });
  doc.mixer.groups.forEach((g, i) => fxOf(`Group ${i + 1}`, 'group', String(i), g.inserts));
  (doc.mixer.sendBuses ?? []).forEach((b, i) => fxOf(`Send ${i + 1}`, 'send', String(i), b.inserts));
  return out;
}

/** The modulator's shape over two cycles, for the rack row. */
const ModPreview: React.FC<{ m: Modulator }> = ({ m }) => {
  const W = 110, H = 26;
  const span = m.syncBeats > 0 ? m.syncBeats * 2 : 2 / Math.max(0.001, m.rateHz);
  const pts = Array.from({ length: 111 }, (_, i) => {
    const t = (i / 110) * span;
    const v = m.syncBeats > 0 ? modulatorAmount(m, t, 0) : modulatorAmount(m, 0, t);
    return `${i},${(H - 2 - v * (H - 4)).toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="rounded bg-black/40 flex-none" aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke="#00DAF3" strokeWidth={1.2} />
    </svg>
  );
};

export const ModulatorHost: React.FC<Props> = ({ doc, onMutate }) => {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const mutateRef = useRef(onMutate);
  mutateRef.current = onMutate;
  const mods = doc.modulators ?? [];

  const attach = (req: KnobRequest) => {
    // A first write settles anything the control creates on first touch (a pad's drum-synth patch).
    req.set(req.value);
    const before = JSON.parse(JSON.stringify(docRef.current));
    const nudge = (req.max - req.min) * 0.02 || 0.01;
    const moved = req.value + nudge <= req.max ? req.value + nudge : req.value - nudge;
    modCapture.begin();
    req.set(moved);
    // Some panels reach the engine a moment after the doc edit.
    setTimeout(() => {
      modCapture.end();
      const writes = new Map<number, { trackId: string; id: number; before: number; after: number }>();
      for (const w of modCapture.writes) if (w.before !== w.after && !writes.has(w.id)) writes.set(w.id, w);
      let target: ModTarget | null = null;
      if (writes.size) {
        const delta = moved - req.value;
        const links: ParamLink[] = [...writes.values()].map((w) => ({ id: w.id, base: w.before, slope: (w.after - w.before) / delta }));
        const first = [...writes.values()][0];
        target = { kind: 'param', trackId: first.trackId, id: first.id, knobBase: req.value, links };
      } else if (modCapture.messages.length) {
        const m = modCapture.messages[0];
        target = { kind: 'track', trackId: m.trackId, target: m.target };
      } else {
        for (const d of diffNumericLeaves(before, docRef.current)) {
          target = targetFromPath(docRef.current, d.path);
          if (target) break;
        }
      }
      req.set(req.value);
      if (!target) {
        setNotice(`Can't animate ${req.label} yet: it doesn't reach a live parameter.`);
        setOpen(true);
        return;
      }
      // Starts as a gentle move around where the control sits now, inside its travel.
      const swing = (req.max - req.min) * 0.2;
      const lo = Math.max(req.min, req.value - swing);
      const hi = Math.min(req.max, req.value + swing);
      // Doc values may be in other units than the knob (a 0..1 knob over dB): the ends follow them.
      const docEdit = !writes.size && !modCapture.messages.length ? diffNumericLeaves(before, docRef.current)[0] : null;
      const slope = docEdit ? (docEdit.after - docEdit.before) / (moved - req.value) : 1;
      const toDoc = (v: number) => (docEdit ? docEdit.before + slope * (v - req.value) : v);
      const m = newModulator(target, req.label, toDoc(lo), toDoc(hi));
      mutateRef.current((d) => { (d.modulators ??= []).push(m); });
      setNotice(null);
      setOpen(true);
    }, 120);
  };

  useEffect(() => {
    knobBridge.request = attach;
    return () => { knobBridge.request = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (id: string, fn: (m: Modulator) => void) => onMutate((d) => {
    const m = d.modulators?.find((x) => x.id === id);
    if (m) fn(m);
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} data-testid="modulators-open"
        title="Parameter animation: right-click any knob to make it move by itself"
        className="fixed right-3 bottom-14 z-[75] h-8 px-3 rounded-full border text-[11px] flex items-center gap-1.5 shadow-lg"
        style={mods.length ? { borderColor: '#00DAF3', color: '#00DAF3', background: '#0B1518' } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', background: '#101014' }}>
        <Waves size={12} /> {mods.length ? `${mods.length} moving` : 'Animate'}
      </button>
    );
  }

  const options = pickableTargets(doc);
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <div className="fixed right-3 bottom-3 z-[75] w-[620px] max-w-[calc(100vw-24px)] max-h-[60vh] flex flex-col rounded-2xl border border-white/15 shadow-2xl" style={{ background: '#101014' }} data-testid="modulator-rack" role="dialog" aria-label="Parameter animation">
      <div className="flex items-center gap-2 px-3 h-10 flex-none border-b border-white/10">
        <Waves size={13} className="text-[#00DAF3]" />
        <span className="text-[11px] font-semibold text-white/85">Animate</span>
        <span className="text-[10px] text-white/35">right-click any knob, or add from the list</span>
        <span className="flex-1" />
        <select value="" aria-label="Add a modulator" onChange={(e) => {
          const o = options[Number(e.target.value)];
          if (o) onMutate((d) => { (d.modulators ??= []).push(newModulator(o.target, `${o.label} · ${o.group}`, o.min, o.max)); });
        }} className={`${selectCls} max-w-[200px]`}>
          <option value="">Add…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {options.map((o, i) => (o.group === g ? <option key={i} value={i}>{o.label}</option> : null))}
            </optgroup>
          ))}
        </select>
        <button onClick={() => setOpen(false)} aria-label="Close animation rack" className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"><X size={13} /></button>
      </div>
      {notice && <p className="px-3 py-1.5 text-[10px] text-[#F59E0B] border-b border-white/10">{notice}</p>}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5">
        {!mods.length && <p className="text-[11px] text-white/30 p-3">Nothing is moving yet. Right-click a knob on any instrument, insert or macro.</p>}
        {mods.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/10 p-2" style={{ opacity: m.on ? 1 : 0.55 }} data-testid="modulator-row">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => edit(m.id, (x) => { x.on = !x.on; })} aria-pressed={m.on} className="h-6 px-2 rounded-md text-[10px] font-semibold border"
                style={m.on ? { borderColor: '#00DAF3', color: '#00DAF3', background: 'rgba(0,218,243,0.1)' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>{m.on ? 'On' : 'Off'}</button>
              <span className="text-[11px] text-white/80 truncate max-w-[180px]" title={m.label}>{m.label}</span>
              <span className="flex-1" />
              <ModPreview m={m} />
              <button onClick={() => onMutate((d) => { d.modulators = d.modulators?.filter((x) => x.id !== m.id); })} aria-label={`Remove modulator on ${m.label}`} className="w-6 h-6 grid place-items-center rounded text-white/30 hover:text-[#EF4444]"><Trash2 size={11} /></button>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <select aria-label="Wave" value={m.wave} title={waveById(m.wave).hint} onChange={(e) => edit(m.id, (x) => { x.wave = e.target.value; })} className={selectCls}>
                {WAVES.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <select aria-label="Curve" value={m.curve} title={curveById(m.curve).hint} onChange={(e) => edit(m.id, (x) => { x.curve = e.target.value; })} className={selectCls}>
                {CURVES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {m.curve !== 'linear' && <Slider label="Amount" v={m.curveAmt} min={0} max={1} on={(v) => edit(m.id, (x) => { x.curveAmt = v; })} />}
              <select aria-label="Rate" value={m.syncBeats} onChange={(e) => edit(m.id, (x) => { x.syncBeats = Number(e.target.value); })} className={selectCls}>
                {SYNC.map((s) => <option key={s.l} value={s.v}>{s.l}</option>)}
              </select>
              {m.syncBeats === 0 && <Slider label="Hz" v={m.rateHz} min={0.02} max={20} on={(v) => edit(m.id, (x) => { x.rateHz = v; })} log />}
              <Slider label="Phase" v={m.phase} min={0} max={1} on={(v) => edit(m.id, (x) => { x.phase = v; })} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Slider label="From" v={m.min} min={rangeOf(m).min} max={rangeOf(m).max} on={(v) => edit(m.id, (x) => { x.min = v; })} />
              <Slider label="To" v={m.max} min={rangeOf(m).min} max={rangeOf(m).max} on={(v) => edit(m.id, (x) => { x.max = v; })} />
              <Slider label="Chance" v={m.probability} min={0} max={1} on={(v) => edit(m.id, (x) => { x.probability = v; })} />
              <Slider label="Random" v={m.randomness} min={0} max={1} on={(v) => edit(m.id, (x) => { x.randomness = v; })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** How far the From/To sliders reach: twice the span set when attached, around where it sits. */
function rangeOf(m: Modulator): { min: number; max: number } {
  const span = Math.max(Math.abs(m.max - m.min), 1e-3);
  return { min: Math.min(m.min, m.max) - span, max: Math.max(m.min, m.max) + span };
}

const Slider: React.FC<{ label: string; v: number; min: number; max: number; log?: boolean; on: (v: number) => void }> = ({ label, v, min, max, log, on }) => {
  const toPos = (x: number) => (log ? Math.log(x / min) / Math.log(max / min) : (x - min) / (max - min));
  const fromPos = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  return (
    <label className="flex items-center gap-1 text-[9.5px] text-white/40">{label}
      <input type="range" min={0} max={1} step={0.001} value={Math.max(0, Math.min(1, toPos(v)))} onChange={(e) => on(fromPos(Number(e.target.value)))} className="w-14 accent-[#00DAF3]" aria-label={label} />
      <span className="font-mono text-white/55 w-9">{Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}</span>
    </label>
  );
};
