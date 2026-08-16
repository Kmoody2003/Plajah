// ONDA — the Play surface.
//
// The whole design bet: twelve controls and no manual, with everything deeper one click away.
// Macros are named by the preset, so the same knob is "Growl" on a Reese and "Air" on a pad —
// the sound designer decides what matters, not the parameter list.

import React, { useCallback, useMemo, useState } from 'react';
import { X, Piano, Search } from 'lucide-react';
import type { GrooveDoc, ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { FACTORY_PRESETS, PRESET_CATEGORIES } from '../../../../services/melos/instruments/onda/presets';
import { deserializePatch, serializePatch, type OndaPatch } from '../../../../services/melos/instruments/onda/patch';
import { E, F, O, P, env, flt, formatParam, osc } from '../../../../services/melos/instruments/onda/params';
import { Knob } from '../shared/Knob';
import { WavetableDisplay } from './WavetableDisplay';
import { ArpPanel } from './ArpPanel';
import { defaultArpPatch, type ArpPatch } from '../../../../services/melos/arp';
import { ARMED, PLAYHEAD, SELECT, SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

const MACRO_COLORS = ['#FF8C00', '#D0BCFF', '#FF8C00', '#00DAF3', '#F4F0F7', '#F4F0F7', '#D40055', '#00DAF3'];

export const InstrumentPanel: React.FC<Props> = ({ doc, track, onMutate, onClose }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const patch = useMemo<OndaPatch | null>(
    () => (track.instrument?.patch ? deserializePatch(track.instrument.patch) : null),
    [track.instrument?.patch],
  );

  /** Edit a param: update the stored patch AND push it to the live engine in the same gesture. */
  const setParam = useCallback((id: number, value: number) => {
    BeatsEngine.get().getInstrument(track.id)?.setParam(id, value);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { params?: Record<number, number> } | undefined;
      if (p) {
        if (!p.params) p.params = {};
        p.params[id] = value;
      }
    });
  }, [onMutate, track.id]);

  const setMacro = useCallback((index: number, value: number) => {
    BeatsEngine.get().getInstrument(track.id)?.setMacro(index, value);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { macros?: { name: string; value: number }[] } | undefined;
      if (p?.macros?.[index]) p.macros[index].value = value;
    });
  }, [onMutate, track.id]);

  const loadPreset = useCallback((preset: OndaPatch) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      t.instrument.patch = serializePatch(preset);
      t.instrument.presetName = preset.name;
      t.name = preset.name;
    });
    // Reload into the live engine from the freshly written doc.
    setTimeout(() => {
      const t = BeatsEngine.get().getDoc().arrangement.find((x) => x.id === track.id);
      if (t) void BeatsEngine.get().reloadPatch(t);
    }, 0);
  }, [onMutate, track.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FACTORY_PRESETS.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)) || p.category.toLowerCase().includes(q);
    });
  }, [query, category]);

  // The Arp lives on the instrument, so a preset can BE a riff.
  const arp: ArpPatch = { ...defaultArpPatch(), ...((track.instrument?.arp || {}) as Partial<ArpPatch>) };
  const editArp = useCallback((fn: (a: ArpPatch) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const next: ArpPatch = { ...defaultArpPatch(), ...((t.instrument.arp || {}) as Partial<ArpPatch>) };
      // Steps are cloned so an edit never mutates the shared default array.
      next.steps = next.steps.map((s) => ({ ...s, locks: s.locks.map((l) => ({ ...l })) }));
      fn(next);
      t.instrument.arp = next as unknown as Record<string, unknown>;
    });
  }, [onMutate, track.id]);

  /** What a step can lock: the parameters worth reaching for, named as the UI names them. */
  const lockTargets = useMemo(() => ([
    { id: flt(0, F.CUTOFF), name: 'Filter cutoff' },
    { id: flt(0, F.RES), name: 'Filter resonance' },
    { id: osc(0, O.MORPH), name: 'Wavetable morph' },
    { id: osc(0, O.LEVEL), name: 'Osc 1 level' },
    { id: osc(0, O.COARSE), name: 'Osc 1 pitch' },
    { id: P.UNISON_DETUNE, name: 'Unison detune' },
    { id: P.UNISON_WIDTH, name: 'Width' },
    { id: env(0, E.DECAY), name: 'Amp decay' },
    { id: env(0, E.RELEASE), name: 'Amp release' },
    { id: P.MASTER_GAIN, name: 'Level' },
  ]), []);

  const val = (id: number, fallback: number) => patch?.params?.[id] ?? fallback;
  const morph = val(osc(0, O.MORPH), 0);
  const tableId = patch?.tables?.[0] || 'analog-sweep';

  const audition = useCallback((key: number) => {
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then(() => {
      engine.instrumentNoteOn(track, key, 100);
      setTimeout(() => engine.instrumentNoteOff(track, key), 400);
    });
  }, [track]);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 backdrop-blur-sm p-5" onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-[22px] border border-white/[0.16] overflow-hidden shadow-2xl"
        style={{ background: SURFACE }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* top bar */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0E0E12' }}>
          <span className="font-black text-[13px] tracking-[0.06em] bg-gradient-to-br from-[#B84DFF] to-[#D40055] bg-clip-text text-transparent">ONDA</span>
          <span className="h-7 px-3 rounded-lg border border-white/10 text-[11px] text-white/70 flex items-center gap-2 min-w-[190px] justify-between">
            {patch?.name || 'Init'} <span className="text-white/30">{patch?.category}</span>
          </span>
          <span className="flex-1" />
          <button
            onClick={() => onMutate((d) => {
              const on = !track.armed;
              for (const t of d.arrangement) t.armed = false;
              const t = d.arrangement.find((x) => x.id === track.id);
              if (t) t.armed = on;
            })}
            className="h-7 px-3 rounded-lg text-[11px] border flex items-center gap-1.5"
            style={track.armed
              ? { borderColor: ARMED, color: ARMED, background: 'rgba(255,140,0,0.12)' }
              : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
          ><Piano size={12} /> {track.armed ? 'Armed' : 'Arm'}</button>
          <button onClick={onClose} aria-label="Close instrument" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white hover:bg-white/10">
            <X size={15} />
          </button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '212px 1fr' }}>
          {/* preset browser */}
          <div className="p-3 border-r border-white/10" style={{ background: '#0C0C10' }}>
            <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Presets</p>
            <div className="relative mb-2">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full h-7 pl-7 pr-2 rounded-lg bg-black/40 border border-white/10 text-[11px] text-white outline-none focus:border-white/30"
              />
            </div>
            <div className="flex flex-wrap gap-1 mb-2.5">
              <button onClick={() => setCategory(null)} className={`h-[22px] px-2 rounded-lg text-[10px] border ${!category ? 'bg-[#D40055]/20 text-[#FF6E9E] border-transparent' : 'border-white/10 text-white/40'}`}>All</button>
              {PRESET_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c === category ? null : c)} className={`h-[22px] px-2 rounded-lg text-[10px] border ${category === c ? 'bg-[#D40055]/20 text-[#FF6E9E] border-transparent' : 'border-white/10 text-white/40 hover:text-white'}`}>{c}</button>
              ))}
            </div>
            <div className="flex flex-col gap-0.5 max-h-[340px] overflow-y-auto pr-0.5">
              {filtered.map((preset) => {
                const active = preset.name === patch?.name;
                return (
                  <button
                    key={preset.name}
                    onClick={() => loadPreset(preset)}
                    className="text-left px-2 py-1.5 rounded-lg transition-colors"
                    style={active
                      ? { background: `${SELECT}29`, border: `1px solid ${SELECT}59`, color: '#fff' }
                      : { color: 'rgba(255,255,255,0.6)' }}
                  >
                    <span className="text-[11px] block">{preset.name}</span>
                    <span className="text-[9px] block text-white/25 truncate">{preset.tags.slice(0, 3).join(' · ')}</span>
                  </button>
                );
              })}
              {!filtered.length && <p className="text-[10px] text-white/25 px-2 py-3">Nothing matches.</p>}
            </div>
          </div>

          {/* play surface */}
          <div className="p-4">
            <WavetableDisplay tableId={tableId} morph={morph} color="#FF6E9E" />

            <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold mt-4 mb-2">Macros</p>
            <div className="grid grid-cols-8 gap-2 mb-4">
              {(patch?.macros || []).slice(0, 8).map((m, i) => (
                <Knob
                  key={i}
                  label={m.name}
                  value={m.value}
                  min={0}
                  max={1}
                  defaultValue={0.5}
                  size={44}
                  color={MACRO_COLORS[i]}
                  format={(v) => `${Math.round(v * 100)}`}
                  onChange={(v) => setMacro(i, v)}
                />
              ))}
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: '180px 1fr 210px' }}>
              {/* XY morph pad */}
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Morph pad</p>
                <div
                  className="relative rounded-xl border border-white/10 cursor-crosshair"
                  style={{ height: 104, background: SURFACE_RAISED }}
                  onPointerDown={(e) => {
                    const move = (ev: PointerEvent | React.PointerEvent) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const x = Math.max(0, Math.min(1, ((ev as PointerEvent).clientX - r.left) / r.width));
                      const y = Math.max(0, Math.min(1, 1 - ((ev as PointerEvent).clientY - r.top) / r.height));
                      // X sweeps the wavetable, Y opens the filter — the two things worth a thumb.
                      setParam(osc(0, O.MORPH), x);
                      setParam(flt(0, F.CUTOFF), y);
                    };
                    move(e);
                    const up = () => { window.removeEventListener('pointermove', move as EventListener); window.removeEventListener('pointerup', up); };
                    window.addEventListener('pointermove', move as EventListener);
                    window.addEventListener('pointerup', up);
                  }}
                >
                  <div className="absolute inset-0 rounded-xl" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 25%), repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 25%)' }} />
                  <div
                    className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full pointer-events-none"
                    style={{
                      left: `${morph * 100}%`,
                      top: `${(1 - val(flt(0, F.CUTOFF), 1)) * 100}%`,
                      background: SELECT,
                      boxShadow: `0 0 18px ${SELECT}b3`,
                    }}
                  />
                </div>
              </div>

              {/* amp envelope */}
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Amp envelope</p>
                <div className="flex gap-3 justify-around rounded-xl border border-white/10 px-2 py-2" style={{ height: 104, background: SURFACE_RAISED }}>
                  {([[E.ATTACK, 'Attack'], [E.DECAY, 'Decay'], [E.SUSTAIN, 'Sustain'], [E.RELEASE, 'Release']] as const).map(([p, label]) => (
                    <Knob
                      key={label}
                      label={label}
                      value={val(env(0, p), p === E.SUSTAIN ? 0.8 : 0.2)}
                      min={0} max={1} defaultValue={p === E.SUSTAIN ? 0.8 : 0.2}
                      size={38}
                      color={PLAYHEAD}
                      format={(v) => formatParam(env(0, p), v)}
                      onChange={(v) => setParam(env(0, p), v)}
                    />
                  ))}
                </div>
              </div>

              {/* filter + level */}
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-1.5">Filter · Ladder</p>
                <div className="flex gap-3 justify-around rounded-xl border border-white/10 px-2 py-2" style={{ height: 104, background: SURFACE_RAISED }}>
                  <Knob label="Cutoff" value={val(flt(0, F.CUTOFF), 1)} min={0} max={1} defaultValue={1} size={40} color={ARMED}
                    format={(v) => formatParam(flt(0, F.CUTOFF), v)} onChange={(v) => setParam(flt(0, F.CUTOFF), v)} />
                  <Knob label="Reso" value={val(flt(0, F.RES), 0.1)} min={0} max={1} defaultValue={0.1} size={40} color={ARMED}
                    format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setParam(flt(0, F.RES), v)} />
                  <Knob label="Level" value={val(P.MASTER_GAIN, 0.7)} min={0} max={1} defaultValue={0.7} size={40}
                    format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setParam(P.MASTER_GAIN, v)} />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <ArpPanel arp={arp} lockTargets={lockTargets} onChange={editArp} />
            </div>

            {/* mini keyboard — audition without leaving the panel */}
            <div className="flex mt-4 rounded-lg overflow-hidden border border-white/10" style={{ height: 44 }}>
              {Array.from({ length: 24 }, (_, i) => {
                const key = 48 + i;
                const black = [1, 3, 6, 8, 10].includes(((key % 12) + 12) % 12);
                return (
                  <button
                    key={i}
                    onPointerDown={() => audition(key)}
                    className="flex-1 border-r border-black/60 transition-colors"
                    style={{ background: black ? '#15151A' : '#E8E4EE' }}
                    aria-label={`Play note ${key}`}
                  />
                );
              })}
            </div>
            <p className="text-[9px] text-white/22 mt-1.5">
              Arm this track and play your MIDI keyboard, or use the row above. Open the full editor for the mod matrix and breakpoint envelopes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
