// TONOS — world strings, simulated as strings. Pick a region and an instrument, start from a preset,
// shape it with six macros or the physical controls themselves, see the actual string each note is
// played on (length, tension, gauge, inharmonicity), and audition it on a two-octave keyboard.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { TONOS_INSTRUMENTS, TONOS_REGIONS, type TonosRegion } from '../../../../services/melos/instruments/tonos/catalog';
import { RV, TN, TONOS_INDEX_PARAMS, TONOS_PARAM_META, type TonosParamMeta } from '../../../../services/melos/instruments/tonos/params';
import { TONOS_PRESETS } from '../../../../services/melos/instruments/tonos/presets';
import {
  TONOS_MACRO_LABELS, TONOS_MACRO_ORDER, applyTonosPatch, applyTonosPreset, deserializeTonosPatch, newTonosPatch, serializeTonosPatch,
  type TonosMacro, type TonosPatch,
} from '../../../../services/melos/instruments/tonos/patch';
import { describeString } from '../../../../services/melos/instruments/tonos/physics';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  embedded?: boolean;
}

const ACCENT = '#C98B4A';

const EXCITE_LABEL: Record<string, string> = {
  finger: 'plucked with the finger', nail: 'plucked with the nail or picks', plectrum: 'plucked with a plectrum', bachi: 'struck with a bachi',
  hammer: 'struck with hammers', bow: 'bowed', wheel: 'bowed by a wheel', harmonic: 'played in harmonics',
};

const HOW = 'Every note is a real string: its length, tension and material set its pitch, stiffness and how its highs die. The finger, nail, plectrum, hammer or bow touches it with real contact mechanics; curved bridges let it buzz, loose rattlers clatter, and the body the bridge stands on — skin, gourd, wood or bamboo — moves with it and feeds back. No samples, no oscillators.';

/** Two octaves of keys starting at C of the patch's octave. */
const KEYS = Array.from({ length: 25 }, (_, i) => i);
const BLACK = new Set([1, 3, 6, 8, 10]);

export const TonosPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const patch: TonosPatch = useMemo(() => deserializeTonosPatch(track.instrument?.patch) ?? newTonosPatch(), [track.instrument?.patch]);
  const instIndex = patch.instrument;
  const inst = TONOS_INSTRUMENTS[instIndex];
  const [region, setRegion] = useState<TonosRegion>(inst.region);
  const held = useRef<Map<number, number>>(new Map());
  const [octave, setOctave] = useState(() => Math.floor((patch.defaultNote ?? 60) / 12) - 1);
  const [lastNote, setLastNote] = useState<number>(patch.defaultNote ?? 60);

  useEffect(() => { setRegion(inst.region); }, [inst.region]);
  useEffect(() => {
    void BeatsEngine.get().ensureInstrument(track).then((engineInst) => { if (engineInst) applyTonosPatch(engineInst, patch); });
  }, [track, patch]);

  const commit = useCallback((next: TonosPatch, rename?: string) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t || !t.instrument) return;
      t.instrument.type = 'tonos';
      t.instrument.patch = serializeTonosPatch(next);
      if (rename) { t.instrument.presetName = rename; t.name = rename; syncPadWithTrack(d, track.id); }
    });
  }, [onMutate, track.id]);

  const pickPreset = (p: (typeof TONOS_PRESETS)[number]) => {
    liveBus.emit({ kind: 'preset', instrument: 'tonos', trackId: track.id, at: liveNow(), presetId: p.id, presetName: p.name });
    commit(applyTonosPreset(patch, p), p.name);
    setOctave(Math.floor(p.defaultNote / 12) - 1);
    setLastNote(p.defaultNote);
  };
  const pickInstrument = (i: number) => {
    const first = TONOS_PRESETS.find((p) => p.instrument === i);
    if (first) pickPreset(first);
  };
  const setParam = (id: number, v: number) => {
    liveBus.emit({ kind: 'param', instrument: 'tonos', trackId: track.id, at: liveNow(), paramId: id });
    commit({ ...patch, params: { ...patch.params, [id]: v } });
  };
  const setMacro = (k: TonosMacro, v: number) => commit({ ...patch, macros: { ...patch.macros, [k]: v } });

  const noteOn = (n: number) => {
    if (!held.current.has(n)) liveBus.emit({ kind: 'note', instrument: 'tonos', trackId: track.id, at: liveNow(), key: n, velocity: 0.8, on: true });
    setLastNote(n);
    const eng = BeatsEngine.get();
    void eng.init().then(async () => {
      const engineInst = await eng.ensureInstrument(track);
      if (!engineInst || held.current.has(n)) return;
      held.current.set(n, engineInst.noteOn(n, 0.8, 0, 0, 1));
    });
  };
  const noteOff = (n: number) => {
    liveBus.emit({ kind: 'note', instrument: 'tonos', trackId: track.id, at: liveNow(), key: n, velocity: 0, on: false });
    const vid = held.current.get(n);
    held.current.delete(n);
    if (vid === undefined) return;
    void BeatsEngine.get().ensureInstrument(track).then((engineInst) => engineInst?.noteOff(vid, true));
  };
  useEffect(() => () => { for (const n of [...held.current.keys()]) noteOff(n); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applies = (m: TonosParamMeta): boolean => {
    switch (m.when) {
      case 'bowed': return inst.excite === 'bow' || inst.excite === 'wheel';
      case 'plucked': return !['bow', 'wheel', 'hammer'].includes(inst.excite);
      case 'struck': return inst.excite === 'hammer';
      case 'jawari': return inst.jawari;
      case 'rattle': return inst.rattle !== null;
      case 'skin': return inst.body === 'skin';
      case 'courses': return inst.courses > 1;
      case 'harmonic': return inst.excite === 'harmonic';
      case 'sympathetic': return (patch.params[TN.SYMP] ?? 0) > 0.001;
      default: return true;
    }
  };
  const controls = TONOS_PARAM_META.filter(applies);
  const groups: { id: TonosParamMeta['group']; label: string }[] = [
    { id: 'string', label: 'String' }, { id: 'touch', label: 'Touch' }, { id: 'bridge', label: 'Bridge' }, { id: 'body', label: 'Body' }, { id: 'hand', label: 'Left hand' },
  ];
  const stringLine = describeString(instIndex, lastNote, patch.params[TN.TENSION] ?? 0.5, patch.params[TN.MATERIAL] ?? 0);

  const body = (
    <div className="flex flex-col gap-4 p-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>TONOS · world strings, physically modelled</p>
          <h2 className="text-lg font-black">{patch.name}</h2>
        </div>
        {!embedded && <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X size={16} /></button>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Region">
        {TONOS_REGIONS.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === region} onClick={() => setRegion(r.id)} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={r.id === region ? { background: ACCENT, color: '#000', borderColor: 'transparent' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TONOS_INSTRUMENTS.map((x, i) => x.region === region && (
          <button key={x.name} onClick={() => pickInstrument(i)} className="px-2.5 py-1 rounded-lg text-[11px] font-bold border"
            style={i === instIndex ? { borderColor: ACCENT, color: ACCENT, background: 'rgba(201,139,74,0.12)' } : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
            {x.name}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white/[0.04] border border-white/8 p-3 flex flex-col gap-1.5">
        <p className="text-[12px] text-white/80"><span className="font-black" style={{ color: ACCENT }}>{inst.name}</span> · {inst.origin} · {EXCITE_LABEL[inst.excite]}</p>
        <p className="text-[11px] text-white/55 leading-relaxed">{inst.about}</p>
        <p className="text-[10px] font-mono text-white/45" aria-live="polite">Note {lastNote}: {stringLine}</p>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed -mt-2">{HOW}</p>

      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/40">Preset
        <select value={patch.presetId ?? ''} onChange={(e) => { const p = TONOS_PRESETS.find((x) => x.id === e.target.value); if (p) pickPreset(p); }}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] normal-case tracking-normal text-white">
          {TONOS_PRESETS.filter((p) => p.instrument === instIndex).map((p) => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
        </select>
      </label>
      {patch.description && <p className="text-[11px] text-white/45 -mt-2">{patch.description}</p>}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {TONOS_MACRO_ORDER.map((k) => (
          <label key={k} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/8 p-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{TONOS_MACRO_LABELS[k]}</span>
            <input type="range" min={0} max={1} step={0.01} value={patch.macros[k]} onChange={(e) => setMacro(k, Number(e.target.value))} className="w-full accent-[#C98B4A]" aria-label={TONOS_MACRO_LABELS[k]} />
          </label>
        ))}
      </div>

      {groups.map((g) => {
        const items = controls.filter((c) => c.group === g.id);
        if (!items.length) return null;
        return (
          <div key={g.id}>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35 mb-1.5">{g.label}</p>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {items.map((c) => {
                const v = patch.params[c.id] ?? 0;
                if (c.options) {
                  const indexed = TONOS_INDEX_PARAMS.includes(c.id);
                  const at = indexed ? Math.round(v) : Math.round(v * (c.options.length - 1));
                  return (
                    <label key={c.id} className="flex flex-col gap-0.5 text-[11px] text-white/70" title={c.hint}>{c.label}
                      <select value={at} onChange={(e) => { const i = Number(e.target.value); setParam(c.id, indexed ? i : i / (c.options!.length - 1)); }}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[12px] text-white">
                        {c.options.map((o, i) => <option key={i} value={i} className="bg-black">{o}</option>)}
                      </select>
                    </label>
                  );
                }
                if (c.id === TN.LEGATO) {
                  return (
                    <label key={c.id} className="flex flex-col gap-0.5" title={c.hint}>
                      <span className="text-[11px] text-white/70">{c.label}</span>
                      <button onClick={() => setParam(c.id, v > 0.5 ? 0 : 1)} className="self-start px-3 py-1 rounded-full text-[10px] border border-white/15" style={v > 0.5 ? { background: ACCENT, color: '#000' } : undefined}>{v > 0.5 ? 'Slides on' : 'Slides off'}</button>
                    </label>
                  );
                }
                return (
                  <label key={c.id} className="flex flex-col gap-0.5" title={c.hint}>
                    <span className="flex justify-between text-[11px] text-white/70"><span>{c.label}</span><span className="text-white/35">{Math.round(v * 100)}%</span></span>
                    <input type="range" min={0} max={1} step={0.01} value={v} onChange={(e) => setParam(c.id, Number(e.target.value))} className="accent-[#C98B4A]" aria-label={c.label} />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35">Play it</p>
          <div className="flex items-center gap-1 text-[10px] text-white/50">
            <button onClick={() => setOctave((o) => Math.max(0, o - 1))} className="px-2 py-0.5 rounded border border-white/10" aria-label="Octave down">−</button>
            <span>C{octave}</span>
            <button onClick={() => setOctave((o) => Math.min(7, o + 1))} className="px-2 py-0.5 rounded border border-white/10" aria-label="Octave up">+</button>
            <span className="ml-2">Room {Math.round((patch.params[RV.MIX] ?? 0) * 100)}%</span>
          </div>
        </div>
        <div className="flex h-20 select-none touch-none">
          {KEYS.map((k) => {
            const n = (octave + 1) * 12 + k;
            const black = BLACK.has(k % 12);
            return (
              <button key={k} aria-label={`Note ${n}`}
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); noteOn(n); }}
                onPointerUp={() => noteOff(n)} onPointerCancel={() => noteOff(n)} onPointerLeave={() => noteOff(n)}
                className={black ? 'w-[3%] -mx-[1.5%] z-10 h-[62%] bg-black border border-white/20 rounded-b' : 'flex-1 bg-white/90 hover:bg-white border border-black/30 rounded-b'} />
            );
          })}
        </div>
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <div className="fixed inset-y-0 right-0 z-[1200] w-full max-w-[560px] overflow-y-auto custom-scrollbar bg-[#0d0a12] border-l border-white/10 shadow-2xl">{body}</div>
  );
};
