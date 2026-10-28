// LYRA — the physical-model instruments panel: pick the instrument (guitar, piano, violin, sax,
// trumpet, tine piano) and its variant, start from a preset, shape it with six macros or the
// physical controls themselves, and audition it on a two-octave keyboard.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { LY, LYRA_MODELS, LYRA_MODEL_LABELS, LYRA_PARAM_META, LYRA_VARIANTS, RV, type LyraModel } from '../../../../services/melos/instruments/lyra/params';
import { LYRA_PRESETS } from '../../../../services/melos/instruments/lyra/presets';
import {
  LYRA_MACRO_LABELS, LYRA_MACRO_ORDER, applyLyraPatch, applyLyraPreset, deserializeLyraPatch, newLyraPatch, serializeLyraPatch,
  type LyraMacro, type LyraPatch,
} from '../../../../services/melos/instruments/lyra/patch';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  embedded?: boolean;
}

const ACCENT = '#D9B36C';

/** How each model makes its sound — shown under the model picker. */
const HOW: Record<LyraModel, string> = {
  guitar: 'A plucked string: a burst at the pick point travels down a tuned delay loop that loses highs each trip; the body (or, on electric, a pickup and amp) colours it.',
  piano: 'A felt hammer and the soundboard\'s knock excite one to three strings per note, slightly detuned — their beating is the piano\'s two-stage decay. Stiff strings bend the overtones sharp.',
  violin: 'A bowed string: the rosined bow grips and slips (stick-slip friction) at the bow point, and a violin body with its air and wood modes radiates it.',
  sax: 'A reed beating against the mouthpiece drives a conical bore; breath noise, vibrato and growl come from the player.',
  trumpet: 'Buzzing lips drive the brass bore and the bell radiates the highs; mutes reshape the bell. Louder playing steepens the wave — brighter, not just louder.',
  tine: 'Our tine electric piano: a neoprene hammer strikes a tine and its tonebar; a magnetic pickup reads the tine\'s motion through a nonlinear flux curve — the bark — into a preamp and stereo tremolo.',
};

/** Two octaves of keys starting at C of the patch's octave. */
const KEYS = Array.from({ length: 25 }, (_, i) => i);
const BLACK = new Set([1, 3, 6, 8, 10]);

export const LyraPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const patch: LyraPatch = useMemo(() => deserializeLyraPatch(track.instrument?.patch) ?? newLyraPatch(), [track.instrument?.patch]);
  const model = patch.model;
  const variant = Math.round(patch.params[LY.VARIANT] ?? 0);
  const held = useRef<Map<number, number>>(new Map());
  const [octave, setOctave] = useState(() => Math.floor((patch.defaultNote ?? 60) / 12) - 1);

  useEffect(() => {
    void BeatsEngine.get().ensureInstrument(track).then((inst) => { if (inst) applyLyraPatch(inst, patch); });
  }, [track, patch]);

  const commit = useCallback((next: LyraPatch, rename?: string) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t || !t.instrument) return;
      t.instrument.type = 'lyra';
      t.instrument.patch = serializeLyraPatch(next);
      if (rename) { t.instrument.presetName = rename; t.name = rename; syncPadWithTrack(d, track.id); }
    });
  }, [onMutate, track.id]);

  const pickModel = (m: LyraModel) => {
    const first = LYRA_PRESETS.find((p) => p.model === m);
    if (first) { commit(applyLyraPreset(patch, first), first.name); setOctave(Math.floor(first.defaultNote / 12) - 1); }
  };
  const setParam = (id: number, v: number) => commit({ ...patch, params: { ...patch.params, [id]: v } });
  const setMacro = (k: LyraMacro, v: number) => commit({ ...patch, macros: { ...patch.macros, [k]: v } });

  const noteOn = (n: number) => {
    const eng = BeatsEngine.get();
    void eng.init().then(async () => {
      const inst = await eng.ensureInstrument(track);
      if (!inst || held.current.has(n)) return;
      held.current.set(n, inst.noteOn(n, 0.8, 0, 0, 1));
    });
  };
  const noteOff = (n: number) => {
    const vid = held.current.get(n);
    held.current.delete(n);
    if (vid === undefined) return;
    void BeatsEngine.get().ensureInstrument(track).then((inst) => inst?.noteOff(vid, true));
  };
  useEffect(() => () => { for (const n of [...held.current.keys()]) noteOff(n); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const controls = LYRA_PARAM_META.filter((m) => !m.models || m.models.includes(model));
  const groups: { id: (typeof controls)[number]['group']; label: string }[] = [
    { id: 'tone', label: 'Tone' }, { id: 'touch', label: 'Touch' }, { id: 'body', label: 'Body' }, { id: 'expression', label: 'Expression' }, { id: 'amp', label: 'Amp' },
  ];

  const body = (
    <div className="flex flex-col gap-4 p-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>LYRA · physical models</p>
          <h2 className="text-lg font-black">{patch.name}</h2>
        </div>
        {!embedded && <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X size={16} /></button>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LYRA_MODELS.map((m) => (
          <button key={m} onClick={() => pickModel(m)} className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
            style={m === model ? { background: ACCENT, color: '#000', borderColor: 'transparent' } : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
            {LYRA_MODEL_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-white/50 leading-relaxed">{HOW[model]}</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/40">Preset
          <select value={patch.presetId ?? ''} onChange={(e) => { const p = LYRA_PRESETS.find((x) => x.id === e.target.value); if (p) commit(applyLyraPreset(patch, p), p.name); }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] normal-case tracking-normal text-white">
            {LYRA_PRESETS.filter((p) => p.model === model).map((p) => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
          </select>
        </label>
        {LYRA_VARIANTS[model].length > 1 && (
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/40">Instrument
            <select value={variant} onChange={(e) => setParam(LY.VARIANT, Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] normal-case tracking-normal text-white">
              {LYRA_VARIANTS[model].map((v, i) => <option key={v} value={i} className="bg-black">{v}</option>)}
            </select>
          </label>
        )}
      </div>
      {patch.description && <p className="text-[11px] text-white/45 -mt-1">{patch.description}</p>}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {LYRA_MACRO_ORDER.map((k) => (
          <label key={k} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/8 p-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{LYRA_MACRO_LABELS[k]}</span>
            <input type="range" min={0} max={1} step={0.01} value={patch.macros[k]} onChange={(e) => setMacro(k, Number(e.target.value))} className="w-full accent-[#D9B36C]" aria-label={LYRA_MACRO_LABELS[k]} />
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
                const toggle = c.id === LY.PEDAL;
                return (
                  <label key={c.id} className="flex flex-col gap-0.5" title={c.hint}>
                    <span className="flex justify-between text-[11px] text-white/70"><span>{c.label}</span><span className="text-white/35">{toggle ? (v > 0.5 ? 'Down' : 'Up') : `${Math.round(v * 100)}%`}</span></span>
                    {toggle
                      ? <button onClick={() => setParam(c.id, v > 0.5 ? 0 : 1)} className="self-start px-3 py-1 rounded-full text-[10px] border border-white/15" style={v > 0.5 ? { background: ACCENT, color: '#000' } : undefined}>{v > 0.5 ? 'Pedal down' : 'Pedal up'}</button>
                      : <input type="range" min={0} max={1} step={0.01} value={v} onChange={(e) => setParam(c.id, Number(e.target.value))} className="accent-[#D9B36C]" aria-label={c.label} />}
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
            <button onClick={() => setOctave((o) => Math.max(0, o - 1))} className="px-2 py-0.5 rounded border border-white/10">−</button>
            <span>C{octave}</span>
            <button onClick={() => setOctave((o) => Math.min(7, o + 1))} className="px-2 py-0.5 rounded border border-white/10">+</button>
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
