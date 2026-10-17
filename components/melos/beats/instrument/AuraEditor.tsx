// AURA — the full 1960s/1970s hardware editor. The Play panel's "Open Editor" leads here.
//
// Six hardware sections in signal flow order:
//   1. VCO Bank I · II · III (plus Vintage Hardware Wave Bank selectors for VCO 1 & VCO 2)
//   2. Cross-Mod & Vintage Aura (Hard Sync, Cross-Mod Pitch/Filter, Ring Mod, Voice-Card Trim & Preamp)
//   3. Dual Vintage Filters (24dB Moog Transistor Ladder + 12dB Oberheim SEM State-Variable)
//   4. Contour Generators & LFOs (Amp ADSR, Filter ADSR, Mod Env, LFO 1 & 2)
//   5. BBD Ensemble & 6-Stage Phaser (1974 Solina 3-phase BBD String Ensemble + Krautrock Phaser)
//   6. Tape Echo & Chamber Space (15 IPS Tape Saturation, 60Hz Mains Hum, Oxide Crackle, Tape Echo, Reverb)
// Plus an 8-Step 1968 960-style Step Sequencer / Arpeggiator programmer.

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeAuraPatch, applyAuraPatch, auraEngineParams, AURA_EDITOR_GROUPS,
  type AuraPatch, type AuraArpConfig,
} from '../../../../services/melos/instruments/aura/patch';
import {
  AURA_PARAM_META, formatAuraParam, auraDefault, A, P, O, osc,
} from '../../../../services/melos/instruments/aura/params';
import { AURA_WAVETABLES } from '../../../../services/melos/instruments/aura/wavetables';
import { Knob } from '../shared/Knob';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const AURA_ACCENT = '#E59A38';

const SEQ_PATTERNS: { name: string; mode: AuraArpConfig['mode']; rate: AuraArpConfig['rate']; steps: number[] }[] = [
  { name: 'Berlin 960', mode: 'seq', rate: '1/16', steps: [0, 0, 12, 7, 0, 10, 7, 5] },
  { name: 'Moroder Octave', mode: 'octave', rate: '1/16', steps: [0, 0, 12, 12, 0, 0, 12, 12] },
  { name: 'Synthi AKS', mode: 'seq', rate: '1/16', steps: [0, 7, 12, 3, 10, 5, 15, -5] },
  { name: 'Düsseldorf Robot', mode: 'seq', rate: '1/16', steps: [0, 12, 0, 10, 0, 7, -2, 5] },
  { name: 'Fifths Cascade', mode: 'upDown', rate: '1/16', steps: [0, 7, 12, 19, 24, 19, 12, 7] },
];

export const AuraEditor: React.FC<Props> = ({ track, onMutate, onClose }) => {
  // Deliberately not memoised — the GrooveDoc mutates in place.
  const patch: AuraPatch | null = deserializeAuraPatch(track.instrument?.patch);

  const val = (id: number, fallback: number) => patch?.params?.[id] ?? fallback;

  const setParam = useCallback((id: number, value: number) => {
    BeatsEngine.get().getInstrument(track.id)?.setParam(id, value);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const p = t?.instrument?.patch as { params?: Record<string, number> } | undefined;
      if (!p) return;
      if (!p.params) p.params = {};
      p.params[String(id)] = value;
    });
  }, [onMutate, track.id]);

  const setWaveTable = useCallback((slot: 0 | 1, tableId: string) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeAuraPatch(raw);
      if (!next) return;
      next.tables = [next.tables[0] || '', next.tables[1] || ''];
      next.tables[slot] = tableId;
      // Mode 0 = Wavetable, Mode 1 = Pure Analog VCO
      next.params[osc(slot, O.MODE)] = tableId ? 0 : 1;
      raw.tables = [...next.tables];
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));

      const engine = BeatsEngine.get();
      const inst = engine.getInstrument(track.id);
      if (inst) {
        applyAuraPatch(inst, next);
      } else {
        const trk = engine.getDoc().arrangement.find((x) => x.id === track.id);
        if (trk) void engine.ensureInstrument(trk).then((i) => { if (i) applyAuraPatch(i, next); });
      }
    });
  }, [onMutate, track.id]);

  const setArp = useCallback((fn: (arp: AuraArpConfig) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeAuraPatch(raw);
      if (!next) return;
      const arp: AuraArpConfig = {
        ...next.arp,
        steps: [...(next.arp.steps || [0, 7, 12, 7, 0, 12, 7, 19])],
      };
      fn(arp);
      raw.arp = {
        enabled: !!arp.enabled,
        mode: arp.mode,
        rate: arp.rate,
        gate: arp.gate,
        octaves: arp.octaves,
        steps: arp.steps.slice(0, 8),
      };
    });
  }, [onMutate, track.id]);

  const applyConditionPreset = useCallback((condition: 'mint' | 'studio' | 'road' | 'attic') => {
    const map = {
      mint:   { aura: 0.14, warmth: 0.22, drift: 0.14, tape: 0.18, hum: 0.01, crackle: 0.0 },
      studio: { aura: 0.42, warmth: 0.46, drift: 0.34, tape: 0.42, hum: 0.06, crackle: 0.04 },
      road:   { aura: 0.72, warmth: 0.68, drift: 0.58, tape: 0.64, hum: 0.15, crackle: 0.14 },
      attic:  { aura: 0.92, warmth: 0.82, drift: 0.80, tape: 0.84, hum: 0.26, crackle: 0.30 },
    }[condition];
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeAuraPatch(raw);
      if (!next) return;
      next.params[A.AURA] = map.aura;
      next.params[A.WARMTH] = map.warmth;
      next.params[P.ANALOG_DRIFT] = map.drift;
      next.params[A.TAPE_SAT] = map.tape;
      next.params[A.HUM] = map.hum;
      next.params[A.CRACKLE] = map.crackle;
      next.macros.aura = map.aura;
      next.macros.warmth = map.warmth;
      raw.macros = { ...next.macros };
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));
      const inst = BeatsEngine.get().getInstrument(track.id);
      inst?.setParams(auraEngineParams(next));
    });
  }, [onMutate, track.id]);

  if (!patch) return null;

  const arp = patch.arp;

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: SURFACE }}>
      {/* Hardware Header with Walnut Trim */}
      <div
        className="flex items-center gap-3 px-4 h-12 flex-none border-b border-[#E59A38]/20"
        style={{
          background: 'linear-gradient(90deg, #2A1810 0%, #151210 4%, #151210 96%, #2A1810 100%)',
        }}
      >
        <span className="font-black text-[11px] tracking-[0.2em]" style={{ color: AURA_ACCENT }}>
          AURA · CIRCUIT EDITOR
        </span>
        <span className="text-white/25">·</span>
        <span className="text-[12px] font-semibold text-white truncate">{patch.name}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
          style={{ background: 'rgba(229,154,56,0.16)', color: AURA_ACCENT, border: '1px solid rgba(229,154,56,0.35)' }}
        >
          {patch.year}
        </span>
        <span className="text-[10.5px] text-white/40 truncate hidden sm:inline">
          {patch.inspiration}
        </span>
        <span className="flex-1" />

        {/* Quick Vintage Condition Selector */}
        <div className="hidden md:flex items-center gap-1 mr-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/35 mr-1">Calibration:</span>
          {([
            ['mint', "'68 Mint"],
            ['studio', "'74 Studio"],
            ['road', "'78 Road-Worn"],
            ['attic', 'Attic Tape'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => applyConditionPreset(key)}
              className="px-2 py-0.5 rounded border border-white/10 text-[9.5px] font-mono text-white/55 hover:text-[#E59A38] hover:border-[#E59A38]/40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          aria-label="Close editor"
          className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        {/* Vintage Hardware Wave Bank & Voice Architecture Strip */}
        <section
          className="rounded-[14px] border border-[#E59A38]/20 p-3 flex flex-wrap items-center gap-4"
          style={{ background: 'linear-gradient(180deg, rgba(229,154,56,0.06), rgba(255,255,255,0.015))' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: AURA_ACCENT }} />
            <span className="text-[9.5px] uppercase tracking-[0.16em] text-[#E59A38]/85 font-semibold">
              Hardware Wave Banks
            </span>
          </div>

          {([0, 1] as const).map((slot) => (
            <label key={slot} className="flex items-center gap-2 text-[10.5px] text-white/65">
              <span className="font-mono text-[9.5px] uppercase text-white/40">VCO {slot + 1} ROM/Tape:</span>
              <select
                value={patch.tables[slot] || ''}
                onChange={(e) => setWaveTable(slot, e.target.value)}
                className="h-7 rounded-lg bg-black/50 border border-white/15 px-2 text-[11px] text-white outline-none focus:border-[#E59A38]"
              >
                <option value="">Pure Analog VCO (PolyBLEP)</option>
                {AURA_WAVETABLES.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.era}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="font-mono text-[9.5px] uppercase text-white/40">Keyboard Assign:</span>
            {(['Poly', 'Mono', 'Legato'] as const).map((label, idx) => {
              const active = Math.round(val(P.VOICE_MODE, 0)) === idx;
              return (
                <button
                  key={label}
                  onClick={() => setParam(P.VOICE_MODE, idx)}
                  className="h-6 px-2.5 rounded text-[10px] font-mono uppercase tracking-wider border transition-colors"
                  style={active
                    ? { borderColor: AURA_ACCENT, background: 'rgba(229,154,56,0.2)', color: '#FFD28A' }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* All 6 Hardware Parameter Groups */}
        {AURA_EDITOR_GROUPS.map((group) => (
          <section
            key={group.key}
            className="rounded-[14px] border border-white/10 p-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: group.color }} />
              <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/55 font-semibold">
                {group.title}
              </span>
              <span className="text-[9.5px] text-white/30">{group.blurb}</span>
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(66px, 1fr))' }}>
              {group.ids.map((id) => {
                const meta = AURA_PARAM_META[id];
                if (!meta) return null;
                return (
                  <Knob
                    key={id}
                    label={meta.label}
                    value={val(id, auraDefault(id))}
                    min={0}
                    max={meta.options ? meta.options.length - 1 : 1}
                    defaultValue={auraDefault(id)}
                    color={group.color}
                    size={44}
                    format={(v) => (meta.toggle ? (v > 0.5 ? 'on' : 'off') : formatAuraParam(id, v))}
                    onChange={(v) => setParam(id, meta.toggle ? (v > 0.5 ? 1 : 0) : v)}
                  />
                );
              })}
            </div>
          </section>
        ))}

        {/* 1968 960 / Synthi AKS 8-Step Sequencer & Arpeggiator */}
        <section
          className="rounded-[14px] border border-white/10 p-3"
          style={{ background: SURFACE_RAISED }}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F0B849' }} />
            <span className="text-[9.5px] uppercase tracking-[0.16em] text-white/55 font-semibold">
              960 Sequential Controller & Arpeggiator
            </span>
            <button
              onClick={() => setArp((a) => { a.enabled = !a.enabled; })}
              className="h-6 px-2.5 rounded text-[10px] font-mono uppercase tracking-wider border ml-2"
              style={arp.enabled
                ? { borderColor: AURA_ACCENT, background: 'rgba(229,154,56,0.2)', color: '#FFD28A' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
            >
              {arp.enabled ? '● Clock Running' : '○ Bypass'}
            </button>

            <div className="flex items-center gap-1 ml-2">
              {(['up', 'down', 'upDown', 'octave', 'random', 'seq'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setArp((a) => { a.mode = m; a.enabled = true; })}
                  className="h-6 px-2 rounded text-[9.5px] font-mono uppercase border"
                  style={arp.mode === m
                    ? { borderColor: AURA_ACCENT, color: AURA_ACCENT, background: 'rgba(229,154,56,0.12)' }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                >
                  {m === 'seq' ? '960 Seq' : m === 'random' ? 'Random' : m}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 ml-2">
              {(['1/4', '1/8', '1/8T', '1/16', '1/16T'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setArp((a) => { a.rate = r; })}
                  className="h-6 px-2 rounded text-[9.5px] font-mono border"
                  style={arp.rate === r
                    ? { borderColor: '#5CC9A7', color: '#5CC9A7', background: 'rgba(92,201,167,0.12)' }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 ml-auto">
              {SEQ_PATTERNS.map((sp) => (
                <button
                  key={sp.name}
                  onClick={() => setArp((a) => {
                    a.enabled = true;
                    a.mode = sp.mode;
                    a.rate = sp.rate;
                    a.steps = [...sp.steps];
                  })}
                  className="h-6 px-2 rounded border border-white/10 text-[9px] font-mono text-white/45 hover:text-white hover:border-white/25"
                >
                  {sp.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-8 gap-2">
            {(arp.steps || [0, 7, 12, 7, 0, 12, 7, 19]).slice(0, 8).map((semi, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-white/10 p-2 flex flex-col items-center gap-1.5 bg-black/30"
              >
                <span className="text-[9px] font-mono text-white/35">STAGE {idx + 1}</span>
                <input
                  type="range"
                  min={-12}
                  max={24}
                  step={1}
                  value={semi}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setArp((a) => { a.steps[idx] = v; });
                  }}
                  className="w-full accent-[#E59A38] cursor-pointer"
                  aria-label={`Sequencer stage ${idx + 1} semitone offset`}
                />
                <span className="text-[10.5px] font-mono font-semibold" style={{ color: AURA_ACCENT }}>
                  {semi > 0 ? `+${semi}` : semi} st
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
