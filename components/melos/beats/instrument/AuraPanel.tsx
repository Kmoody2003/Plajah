// AURA — 1960s & 1970s Vintage Voltage-Controlled Analogue Synthesizer Play Surface.
//
// Features:
// - Warm walnut/rosewood side-cheek trim & dark anodized bronze panel aesthetic
// - Live Amber Cathode-Ray Oscilloscope (CRO) & backlit Vintage VU Meter
// - Interactive XY / CS-80 Ribbon Controller (MorphPad) with gesture loop recording
// - 6 Front-Panel Vintage Macros (Warmth, Cutoff, Resonance, Vintage Aura, Ensemble, Tape Space)
// - Quick Vintage Calibration selector ('68 Mint, '74 Studio, '78 Road-Worn, Attic Tape)
// - Built-in 1968 960-style 8-Step Sequencer / Arpeggiator + 2-Octave Ivory/Ebony Audition Keyboard
// - Full 56-Template Classic 1960s & 1970s Preset Browser with Era/Category tabs & A×B Crossform

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles, Sliders, Volume2 } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import {
  deserializeAuraPatch, applyAuraPreset, auraEngineParams, applyAuraPatch, crossformAuraPatch,
  newAuraPatch, serializeAuraPatch,
  AURA_MACRO_HINTS, AURA_MACRO_LABELS, AURA_MACRO_ORDER,
  type AuraPatch, type PadTarget, type AuraArpConfig,
} from '../../../../services/melos/instruments/aura/patch';
import {
  AURA_PRESETS, AURA_CATEGORY_ORDER, AURA_CATEGORY_LABELS,
  type AuraMacro, type AuraCategory,
} from '../../../../services/melos/instruments/aura/presets';
import { A, P, O, F, auraParamLabel, osc, flt } from '../../../../services/melos/instruments/aura/params';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { MorphPad, padValue } from './MorphPad';
import { Knob } from '../shared/Knob';
import { AuraEditor, AURA_ACCENT } from './AuraEditor';
import { SURFACE, SURFACE_RAISED } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  /** Hosted inside the shared InstrumentWindow — chrome comes from the window. */
  embedded?: boolean;
}

const MACRO_COLORS: Record<AuraMacro, string> = {
  warmth: '#E59A38',
  cutoff: '#F0B849',
  resonance: '#E07A3C',
  aura: '#D96B43',
  ensemble: '#5CC9A7',
  space: '#63B8DE',
};

const KEYBOARD_NOTES = [
  { semi: 0, label: 'C', black: false },
  { semi: 1, label: 'C#', black: true },
  { semi: 2, label: 'D', black: false },
  { semi: 3, label: 'D#', black: true },
  { semi: 4, label: 'E', black: false },
  { semi: 5, label: 'F', black: false },
  { semi: 6, label: 'F#', black: true },
  { semi: 7, label: 'G', black: false },
  { semi: 8, label: 'G#', black: true },
  { semi: 9, label: 'A', black: false },
  { semi: 10, label: 'A#', black: true },
  { semi: 11, label: 'B', black: false },
  { semi: 12, label: 'C', black: false },
  { semi: 13, label: 'C#', black: true },
  { semi: 14, label: 'D', black: false },
  { semi: 15, label: 'D#', black: true },
  { semi: 16, label: 'E', black: false },
  { semi: 17, label: 'F', black: false },
  { semi: 18, label: 'F#', black: true },
  { semi: 19, label: 'G', black: false },
  { semi: 20, label: 'G#', black: true },
  { semi: 21, label: 'A', black: false },
  { semi: 22, label: 'A#', black: true },
  { semi: 23, label: 'B', black: false },
  { semi: 24, label: 'C', black: false },
];

export const AuraPanel: React.FC<Props> = ({ doc, track, onMutate, onClose, embedded }) => {
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [xfOpen, setXfOpen] = useState(false);
  const [xfA, setXfA] = useState(AURA_PRESETS[0].id);
  const [xfB, setXfB] = useState(AURA_PRESETS[24]?.id || AURA_PRESETS[1].id);
  const [xfAmt, setXfAmt] = useState(0);

  // Preset browser filters
  const [catFilter, setCatFilter] = useState<AuraCategory | 'all' | '60s' | '70s'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Audition keyboard & 960 Sequencer state
  const [baseOctave, setBaseOctave] = useState(3);
  const [latchMode, setLatchMode] = useState(false);
  const [heldNote, setHeldNote] = useState<number | null>(null);
  const [activeSeqStep, setActiveSeqStep] = useState<number>(0);
  const activeMidiNoteRef = useRef<number | null>(null);

  // Deliberately not memoised — the GrooveDoc mutates in place.
  const patch: AuraPatch | null = deserializeAuraPatch(track.instrument?.patch);

  /** Fast path: parameters only. */
  const pushParams = useCallback((p: AuraPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) { inst.setParams(auraEngineParams(p)); return; }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) void engine.ensureInstrument(t).then((i) => i?.setParams(auraEngineParams(p)));
  }, [track.id]);

  /** Full path: wavetables + routes + parameters. */
  const pushAll = useCallback((p: AuraPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) { applyAuraPatch(inst, p); return; }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) void engine.ensureInstrument(t).then((i) => { if (i) applyAuraPatch(i, p); });
  }, [track.id]);

  const edit = useCallback((fn: (p: AuraPatch) => void) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeAuraPatch(raw);
      if (!next) return;
      fn(next);
      raw.macros = { ...next.macros };
      raw.params = Object.fromEntries(Object.entries(next.params).map(([k, v]) => [String(k), v]));
      raw.arp = {
        enabled: !!next.arp.enabled,
        mode: next.arp.mode,
        rate: next.arp.rate,
        gate: next.arp.gate,
        octaves: next.arp.octaves,
        steps: [...next.arp.steps],
      };
      pushParams(next);
    });
  }, [onMutate, pushParams, track.id]);

  const choosePreset = useCallback((presetId: string) => {
    const preset = AURA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const current = deserializeAuraPatch(t.instrument.patch) || newAuraPatch();
      const next = applyAuraPreset(current, preset);
      t.instrument.patch = serializeAuraPatch(next);
      t.instrument.presetName = preset.name;
      t.name = preset.name;
      syncPadWithTrack(d, track.id);
      pushAll(next);
    });
    setGalleryOpen(false);
  }, [onMutate, pushAll, track.id]);

  const crossform = useCallback((aId: string, bId: string, amount: number) => {
    const pa = AURA_PRESETS.find((x) => x.id === aId);
    const pb = AURA_PRESETS.find((x) => x.id === bId);
    if (!pa || !pb) return;
    const blended = crossformAuraPatch(newAuraPatch(pa), newAuraPatch(pb), amount);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      t.instrument.patch = serializeAuraPatch(blended);
      t.instrument.presetName = blended.name;
      t.name = blended.name;
      pushAll(blended);
    });
  }, [onMutate, pushAll, track.id]);

  const applyCondition = useCallback((condition: 'mint' | 'studio' | 'road' | 'attic') => {
    const map = {
      mint:   { aura: 0.14, warmth: 0.22, drift: 0.14, tape: 0.18, hum: 0.01, crackle: 0.0 },
      studio: { aura: 0.42, warmth: 0.46, drift: 0.34, tape: 0.42, hum: 0.06, crackle: 0.04 },
      road:   { aura: 0.72, warmth: 0.68, drift: 0.58, tape: 0.64, hum: 0.15, crackle: 0.14 },
      attic:  { aura: 0.92, warmth: 0.82, drift: 0.80, tape: 0.84, hum: 0.26, crackle: 0.30 },
    }[condition];
    edit((p) => {
      p.params[A.AURA] = map.aura;
      p.params[A.WARMTH] = map.warmth;
      p.params[P.ANALOG_DRIFT] = map.drift;
      p.params[A.TAPE_SAT] = map.tape;
      p.params[A.HUM] = map.hum;
      p.params[A.CRACKLE] = map.crackle;
      p.macros.aura = map.aura;
      p.macros.warmth = map.warmth;
    });
  }, [edit]);

  /** Live XY Pad movement */
  const padMove = useCallback((px: number, py: number, targetsX: PadTarget[], targetsY: PadTarget[]) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    if (!inst) return;
    for (const t of targetsX) inst.setParam(t.id, padValue(t, px));
    for (const t of targetsY) inst.setParam(t.id, padValue(t, py));
  }, [track.id]);

  const padCommit = useCallback((px: number, py: number) => {
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      const raw = t?.instrument?.patch as Record<string, unknown> | undefined;
      if (!raw) return;
      const next = deserializeAuraPatch(raw);
      if (!next) return;
      raw.padPos = [px, py];
      if (!raw.params || typeof raw.params !== 'object') raw.params = {};
      const rp = raw.params as Record<string, number>;
      for (const tgt of next.padX) rp[String(tgt.id)] = padValue(tgt, px);
      for (const tgt of next.padY) rp[String(tgt.id)] = padValue(tgt, py);
    });
  }, [onMutate, track.id]);

  // ── Audition Note Triggering & 960 Step Sequencer / Arp Clock ──
  const stopCurrentMidiNote = useCallback(() => {
    if (activeMidiNoteRef.current !== null) {
      BeatsEngine.get().instrumentNoteOff(track, activeMidiNoteRef.current);
      activeMidiNoteRef.current = null;
    }
  }, [track]);

  const triggerNoteOn = useCallback((midiNote: number) => {
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then((inst) => {
      if (inst && patch) applyAuraPatch(inst, patch);
      if (activeMidiNoteRef.current !== null && activeMidiNoteRef.current !== midiNote) {
        engine.instrumentNoteOff(track, activeMidiNoteRef.current);
      }
      activeMidiNoteRef.current = midiNote;
      engine.instrumentNoteOn(track, midiNote, 108);
    });
  }, [patch, track]);

  // Run the 960 Step Sequencer / Arpeggiator when a note is held and arp.enabled is true
  useEffect(() => {
    if (heldNote === null) {
      stopCurrentMidiNote();
      return;
    }
    const arpCfg: AuraArpConfig | undefined = patch?.arp;
    if (!arpCfg?.enabled) {
      triggerNoteOn(heldNote);
      return () => { stopCurrentMidiNote(); };
    }

    const bpm = Math.max(40, Math.min(240, doc.bpm || 120));
    const beatMs = 60000 / bpm;
    const rateMul = arpCfg.rate === '1/4' ? 1
      : arpCfg.rate === '1/8' ? 0.5
      : arpCfg.rate === '1/8T' ? 1 / 3
      : arpCfg.rate === '1/16T' ? 1 / 6
      : 0.25; // '1/16'
    const stepMs = Math.max(55, beatMs * rateMul);
    const gateMs = Math.max(30, stepMs * Math.max(0.2, Math.min(0.95, arpCfg.gate || 0.65)));
    const steps = arpCfg.steps?.length ? arpCfg.steps : [0, 7, 12, 7, 0, 12, 7, 19];

    let idx = 0;
    let gateTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const stepIdx = idx % steps.length;
      setActiveSeqStep(stepIdx);
      let offset = steps[stepIdx] ?? 0;
      if (arpCfg.mode === 'octave') {
        offset = (stepIdx % 2 === 0) ? 0 : 12;
      } else if (arpCfg.mode === 'down') {
        offset = steps[(steps.length - 1 - stepIdx) % steps.length] ?? 0;
      }
      const note = Math.max(24, Math.min(96, heldNote + offset));
      triggerNoteOn(note);
      if (gateTimer) clearTimeout(gateTimer);
      gateTimer = setTimeout(() => {
        stopCurrentMidiNote();
      }, gateMs);
      idx++;
    };

    tick();
    const interval = setInterval(tick, stepMs);
    return () => {
      clearInterval(interval);
      if (gateTimer) clearTimeout(gateTimer);
      stopCurrentMidiNote();
    };
  }, [heldNote, patch?.arp?.enabled, patch?.arp?.mode, patch?.arp?.rate, patch?.arp?.gate, doc.bpm, stopCurrentMidiNote, triggerNoteOn]);

  // Clean up any hanging note on unmount
  useEffect(() => () => stopCurrentMidiNote(), [stopCurrentMidiNote]);

  // ── Amber Cathode-Ray Oscilloscope (CRO) Canvas Renderer ──
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas || !patch) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let phase = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      phase += 0.032;

      // Phosphor persistence fade
      ctx.fillStyle = 'rgba(11, 9, 7, 0.34)';
      ctx.fillRect(0, 0, w, h);

      // Graticule grid
      ctx.strokeStyle = 'rgba(229, 154, 56, 0.09)';
      ctx.lineWidth = 1;
      for (let gx = 1; gx < 8; gx++) {
        const x = (w / 8) * gx;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let gy = 1; gy < 4; gy++) {
        const y = (h / 4) * gy;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      const prm = patch.params;
      const cutoff = prm[flt(0, F.CUTOFF)] ?? 0.55;
      const res = prm[flt(0, F.RES)] ?? 0.25;
      const syncOn = (prm[A.OSC_SYNC] ?? 0) > 0.5;
      const xmodP = prm[A.XMOD_PITCH] ?? 0;
      const xmodF = prm[A.XMOD_FILTER] ?? 0;
      const ringMod = prm[A.RING_MOD] ?? 0;
      const auraAmt = prm[A.AURA] ?? 0.35;
      const warmth = prm[A.WARMTH] ?? 0.35;
      const ensOn = (prm[A.ENS_ON] ?? 0) > 0.5;
      const ensMix = ensOn ? (prm[A.ENS_MIX] ?? 0.5) : 0;
      const phOn = (prm[A.PH_ON] ?? 0) > 0.5;
      const wave1 = (prm[osc(0, O.MODE)] ?? 1) < 0.5 ? 4 : Math.round(prm[osc(0, O.ANALOG_SHAPE)] ?? 0);
      const semi2 = (prm[osc(1, O.COARSE)] ?? 0.5) * 48 - 24;
      const ratio2 = Math.pow(2, semi2 / 12);

      // If ensemble is active, draw a secondary ghost BBD chorus trace
      const traces = ensMix > 0.05 ? 2 : 1;
      for (let tr = traces - 1; tr >= 0; tr--) {
        ctx.beginPath();
        ctx.lineWidth = tr === 0 ? 2.2 : 1.3;
        ctx.strokeStyle = tr === 0
          ? '#F6AD3C'
          : 'rgba(92, 201, 167, 0.55)';
        ctx.shadowColor = tr === 0 ? '#E59A38' : '#5CC9A7';
        ctx.shadowBlur = tr === 0 ? 10 : 4;

        const bbdOffset = tr === 1 ? Math.sin(phase * 1.7) * 0.35 * ensMix : 0;
        const driftWobble = Math.sin(phase * 0.43) * auraAmt * 0.12;

        for (let px = 0; px < w; px++) {
          const normX = px / w;
          const cycles = heldNote !== null ? 3.0 : 2.2;
          const p2 = (normX * cycles * ratio2 + phase * 0.5 + bbdOffset) * Math.PI * 2;
          const osc2 = Math.sin(p2);

          // VCO 1 phase with Sync and Cross-Mod
          let t1 = normX * cycles + phase * 0.35 + driftWobble + bbdOffset;
          if (syncOn) {
            const masterPeriod = 1 / Math.max(0.5, ratio2);
            t1 = (t1 % masterPeriod) * Math.max(1.2, ratio2);
          }
          const p1 = t1 * Math.PI * 2 + osc2 * xmodP * 4.5;

          let s1 = 0;
          if (wave1 === 0) {
            // Sawtooth smoothed by cutoff
            s1 = Math.sin(p1) + 0.5 * cutoff * Math.sin(2 * p1) + 0.33 * cutoff * cutoff * Math.sin(3 * p1);
          } else if (wave1 === 1) {
            // Pulse / Square
            s1 = Math.tanh(Math.sin(p1) * (2.5 + cutoff * 4));
          } else if (wave1 === 2) {
            // Triangle
            s1 = Math.asin(Math.sin(p1)) * (2 / Math.PI);
          } else {
            // Vintage wavebank / complex fold
            s1 = Math.sin(p1 + Math.sin(p1 * 2) * (0.4 + warmth * 0.8));
          }

          // Ring Mod blend
          let sig = s1 * (1 - ringMod * 0.75) + (s1 * osc2) * (ringMod * 0.95);

          // Filter resonance & Cross-Mod Filter ripple
          const resFreq = (3 + cutoff * 9 + osc2 * xmodF * 4) * normX * Math.PI * 2;
          sig += Math.sin(resFreq + phase) * res * 0.38 * Math.exp(-((normX * cycles) % 1) * 2.5);

          // Phaser notch animation
          if (phOn) {
            sig *= 0.78 + 0.22 * Math.cos(normX * 6 + phase * 1.4);
          }

          // Warmth soft saturation
          sig = Math.tanh(sig * (0.85 + warmth * 0.9));

          const y = h * 0.5 - sig * (h * 0.36);
          if (px === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [patch, heldNote]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return AURA_PRESETS.filter((pr) => {
      const yr = Number(pr.year) || 1974;
      if (catFilter === '60s' && yr >= 1970) return false;
      if (catFilter === '70s' && yr < 1970) return false;
      if (catFilter !== 'all' && catFilter !== '60s' && catFilter !== '70s' && pr.category !== catFilter) return false;
      if (!q) return true;
      return (
        pr.name.toLowerCase().includes(q) ||
        pr.inspiration.toLowerCase().includes(q) ||
        pr.description.toLowerCase().includes(q) ||
        String(pr.year).includes(q)
      );
    });
  }, [catFilter, searchQuery]);

  if (!patch) {
    return (
      <div className="p-4 flex items-center gap-3">
        <span className="text-[12px] text-white/50">This track has no AURA patch.</span>
        <button onClick={onClose} className="h-7 px-3 rounded-lg border border-white/15 text-[11px] text-white/60 hover:text-white">
          Close
        </button>
      </div>
    );
  }

  const labelAxis = (ts: PadTarget[], fallback: string) =>
    ts.length === 0 ? fallback : ts.slice(0, 2).map((t) => auraParamLabel(t.id)).join(' + ');

  const prm = patch.params;
  const syncActive = (prm[A.OSC_SYNC] ?? 0) > 0.5;
  const xmodActive = (prm[A.XMOD_PITCH] ?? 0) > 0.04 || (prm[A.XMOD_FILTER] ?? 0) > 0.04;
  const ringActive = (prm[A.RING_MOD] ?? 0) > 0.04;
  const ensActive = (prm[A.ENS_ON] ?? 0) > 0.5;
  const phActive = (prm[A.PH_ON] ?? 0) > 0.5;
  const tapeActive = (prm[A.TAPE_SAT] ?? 0) > 0.15;

  return (
    <div
      className="melos-instr flex flex-col h-full min-h-0 select-none"
      style={{
        background: SURFACE,
        // Subtle walnut wood-cheek borders on left and right edges
        borderLeft: '6px solid #3B2012',
        borderRight: '6px solid #3B2012',
      }}
    >
      {/* ── Hardware Faceplate Header ── */}
      <div
        className="flex items-center gap-2.5 px-4 h-12 flex-none border-b border-[#E59A38]/20"
        style={{ background: 'linear-gradient(180deg, #1B1612 0%, #120F0C 100%)' }}
      >
        <span
          className="font-black text-[11.5px] tracking-[0.2em]"
          style={{ color: AURA_ACCENT, textShadow: '0 0 12px rgba(229,154,56,0.45)' }}
        >
          AURA
        </span>
        <span className="text-white/25">·</span>
        <button
          onClick={() => { setGalleryOpen((v) => !v); setXfOpen(false); }}
          className="flex items-center gap-2 text-left hover:opacity-90 truncate max-w-[42%]"
          title="Browse all 56 classic 1960s & 1970s templates"
        >
          <span className="text-[12.5px] font-semibold text-white truncate">{patch.name}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider flex-none"
            style={{ background: 'rgba(229,154,56,0.18)', color: '#FFD28A', border: '1px solid rgba(229,154,56,0.35)' }}
          >
            {patch.year}
          </span>
        </button>

        <span className="text-[10.5px] text-white/40 truncate hidden md:inline">
          {patch.inspiration}
        </span>

        <span className="flex-1" />

        {/* Voice Mode quick switch */}
        <div className="hidden sm:flex items-center rounded-lg border border-white/10 bg-black/30 p-0.5">
          {(['Poly', 'Mono', 'Legato'] as const).map((lbl, idx) => {
            const on = Math.round(prm[P.VOICE_MODE] ?? 0) === idx;
            return (
              <button
                key={lbl}
                onClick={() => edit((p) => { p.params[P.VOICE_MODE] = idx; })}
                className="px-2 py-0.5 rounded text-[9.5px] font-mono uppercase transition-colors"
                style={on
                  ? { background: 'rgba(229,154,56,0.22)', color: '#FFD28A' }
                  : { color: 'rgba(255,255,255,0.4)' }}
              >
                {lbl}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => { setGalleryOpen((v) => !v); setXfOpen(false); }}
          className="h-7 px-2.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.1em] flex items-center gap-1.5"
          style={galleryOpen
            ? { borderColor: AURA_ACCENT, color: '#FFD28A', background: 'rgba(229,154,56,0.16)' }
            : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)' }}
        >
          <Sparkles size={11} style={{ color: AURA_ACCENT }} />
          56 Templates
        </button>

        <button
          onClick={() => { setXfOpen((v) => !v); setGalleryOpen(false); }}
          className="h-7 px-2.5 rounded-lg border text-[10px] font-mono uppercase tracking-[0.1em]"
          style={xfOpen
            ? { borderColor: AURA_ACCENT, color: AURA_ACCENT, background: 'rgba(229,154,56,0.12)' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }}
          title="Morph between any two vintage templates"
        >
          Crossform
        </button>

        <button
          onClick={() => setEditorOpen(true)}
          className="h-7 px-2.5 rounded-lg border border-white/15 text-[10px] font-mono uppercase tracking-[0.1em] text-white/70 hover:text-white hover:border-white/30 flex items-center gap-1"
        >
          <Sliders size={11} />
          Circuit
        </button>

        {!embedded && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Main Scrollable Faceplate Body ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3">
        {/* ── 56-Preset Vintage Template Browser (when open) ── */}
        {galleryOpen && (
          <div
            className="rounded-xl border border-[#E59A38]/30 p-3 flex flex-col gap-2.5"
            style={{ background: 'linear-gradient(180deg, #17130F 0%, #0E0C0A 100%)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#E59A38] font-bold">
                1960s & 1970s Classic Template Archive ({filteredPresets.length})
              </span>
              <div className="relative ml-auto">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Minimoog, CS-80, Solina, Mellotron, 1974…"
                  className="w-64 h-7 pl-7 pr-2 rounded-lg bg-black/50 border border-white/12 text-[11px] text-white outline-none focus:border-[#E59A38]"
                />
              </div>
            </div>

            {/* Era & Category Filter Pills */}
            <div className="flex flex-wrap gap-1">
              {([
                ['all', `All (${AURA_PRESETS.length})`],
                ['60s', "'60s Era"],
                ['70s', "'70s Era"],
                ...AURA_CATEGORY_ORDER.map((c) => [c, AURA_CATEGORY_LABELS[c]] as const),
              ] as const).map(([key, label]) => {
                const active = catFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCatFilter(key as typeof catFilter)}
                    className="h-6 px-2.5 rounded-md text-[10px] font-mono border transition-colors"
                    style={active
                      ? { borderColor: AURA_ACCENT, background: 'rgba(229,154,56,0.22)', color: '#FFD28A' }
                      : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Preset Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {filteredPresets.map((pr) => {
                const active = pr.id === patch.presetId;
                return (
                  <button
                    key={pr.id}
                    onClick={() => choosePreset(pr.id)}
                    className="text-left rounded-xl border p-2.5 transition-all hover:border-[#E59A38]/60 flex flex-col gap-1"
                    style={{
                      borderColor: active ? AURA_ACCENT : 'rgba(255,255,255,0.09)',
                      background: active ? 'rgba(229,154,56,0.14)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[12px] font-semibold text-white truncate">{pr.name}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold flex-none"
                        style={{ background: 'rgba(229,154,56,0.18)', color: '#FFD28A' }}
                      >
                        {pr.year}
                      </span>
                    </div>
                    <div className="text-[9.5px] font-mono text-[#E59A38]/80 truncate">
                      {pr.inspiration}
                    </div>
                    <div className="text-[10px] text-white/40 line-clamp-2 leading-snug">
                      {pr.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Crossform A×B Vintage Morpher (when open) ── */}
        {xfOpen && (
          <div className="rounded-xl border border-[#E59A38]/25 p-3 flex flex-col gap-2" style={{ background: SURFACE_RAISED }}>
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-[#E59A38]">
                Crossform · Blend Two Classic Circuits
              </span>
              <span className="ml-auto text-[10px] font-mono text-white/40">{Math.round(xfAmt * 100)}%</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <select
                value={xfA}
                onChange={(e) => { setXfA(e.target.value); crossform(e.target.value, xfB, xfAmt); }}
                className="h-7 rounded-lg bg-black/50 border border-white/15 px-2 text-[11px] text-white outline-none"
                aria-label="Crossform source A"
              >
                {AURA_PRESETS.map((p) => <option key={p.id} value={p.id}>[{p.year}] {p.name}</option>)}
              </select>
              <span className="text-[10px] font-mono text-white/30">×</span>
              <select
                value={xfB}
                onChange={(e) => { setXfB(e.target.value); crossform(xfA, e.target.value, xfAmt); }}
                className="h-7 rounded-lg bg-black/50 border border-white/15 px-2 text-[11px] text-white outline-none"
                aria-label="Crossform source B"
              >
                {AURA_PRESETS.map((p) => <option key={p.id} value={p.id}>[{p.year}] {p.name}</option>)}
              </select>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={xfAmt}
              onChange={(e) => {
                const v = Number(e.target.value);
                setXfAmt(v);
                crossform(xfA, xfB, v);
              }}
              aria-label="Crossform blend"
              className="w-full accent-[#E59A38]"
            />
          </div>
        )}

        {/* ── Hero Row: Amber Cathode-Ray Oscilloscope + Circuit Lamps + XY Ribbon Pad ── */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_230px] gap-3 items-stretch">
          {/* Left: Amber Cathode-Ray Scope + Circuit Status Lamps + Vintage Calibration Strip */}
          <div
            className="rounded-xl border border-[#E59A38]/25 p-3 flex flex-col justify-between gap-2.5"
            style={{
              background: 'radial-gradient(120% 100% at 50% 0%, #1D150E 0%, #0D0A08 100%)',
              boxShadow: 'inset 0 2px 18px rgba(0,0,0,0.75)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E59A38] shadow-[0_0_8px_#E59A38]" />
                <span className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-[#E59A38]/85">
                  Cathode-Ray Signal Monitor
                </span>
              </div>
              {/* Active Circuit Indicator Lamps */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'HARD SYNC', on: syncActive, toggleId: A.OSC_SYNC },
                  { label: 'X-MOD', on: xmodActive, toggleId: A.XMOD_FILTER },
                  { label: 'RING MOD', on: ringActive, toggleId: A.RING_MOD },
                  { label: 'SOLINA BBD', on: ensActive, toggleId: A.ENS_ON },
                  { label: '6-STG PHASER', on: phActive, toggleId: A.PH_ON },
                  { label: '15 IPS TAPE', on: tapeActive, toggleId: A.TAPE_SAT },
                ].map((lamp) => (
                  <button
                    key={lamp.label}
                    onClick={() => edit((p) => {
                      const cur = p.params[lamp.toggleId] ?? 0;
                      p.params[lamp.toggleId] = cur > 0.25 ? 0 : (lamp.toggleId === A.OSC_SYNC || lamp.toggleId === A.ENS_ON || lamp.toggleId === A.PH_ON ? 1 : 0.45);
                    })}
                    className="px-1.5 py-0.5 rounded text-[8.5px] font-mono tracking-wider border transition-colors"
                    style={lamp.on
                      ? { borderColor: '#E59A38', background: 'rgba(229,154,56,0.22)', color: '#FFD28A', boxShadow: '0 0 8px rgba(229,154,56,0.25)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)' }}
                    title={`Toggle ${lamp.label}`}
                  >
                    {lamp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Oscilloscope Canvas */}
            <div className="relative rounded-lg overflow-hidden border border-[#E59A38]/20 bg-[#0A0806]">
              <canvas
                ref={scopeCanvasRef}
                width={520}
                height={108}
                className="w-full h-[108px] block"
              />
              <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-[9px] font-mono text-[#E59A38]/60">
                <span>
                  VCO1: {patch.tables[0] ? patch.tables[0].replace('aura-', '').toUpperCase() : 'POLYBLEP ANALOG'} · VCF: {(prm[flt(0, F.TYPE)] ?? 0) < 0.5 ? '24dB MOOG LADDER' : '12dB OBERHEIM SEM'}
                </span>
                <span>
                  AURA DRIFT: {Math.round((prm[A.AURA] ?? 0.35) * 100)}%
                </span>
              </div>
            </div>

            {/* Vintage Calibration Condition Strip & Historical Blurb */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <p className="text-[10.5px] text-white/45 truncate max-w-[60%]" title={patch.description}>
                {patch.description}
              </p>
              <div className="flex items-center gap-1">
                <span className="text-[8.5px] font-mono uppercase text-white/30 mr-0.5">Age:</span>
                {([
                  ['mint', "'68 Mint"],
                  ['studio', "'74 Warm"],
                  ['road', "'78 Worn"],
                  ['attic', 'Attic'],
                ] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => applyCondition(k)}
                    className="px-1.5 py-0.5 rounded border border-white/10 text-[8.5px] font-mono text-white/55 hover:text-[#FFD28A] hover:border-[#E59A38]/40"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: XY / Ribbon Expression Controller */}
          <div className="flex flex-col justify-between">
            <MorphPad
              x={patch.padPos[0]}
              y={patch.padPos[1]}
              targetsX={patch.padX}
              targetsY={patch.padY}
              labelX={labelAxis(patch.padX, 'Cutoff')}
              labelY={labelAxis(patch.padY, 'Warmth + Aura')}
              onMove={(px, py) => padMove(px, py, patch.padX, patch.padY)}
              onCommit={padCommit}
              path={[]}
              recording={false}
              looping={false}
              loopPhase={0}
              accent={AURA_ACCENT}
            />
          </div>
        </div>

        {/* ── 6 Front-Panel Vintage Macro Pots ── */}
        <div
          className="rounded-xl border border-white/10 p-3 grid grid-cols-3 sm:grid-cols-6 gap-2.5"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.25) 100%)' }}
        >
          {AURA_MACRO_ORDER.map((macro) => (
            <div key={macro} className="flex flex-col items-center gap-1" title={AURA_MACRO_HINTS[macro]}>
              <Knob
                label={AURA_MACRO_LABELS[macro]}
                value={patch.macros[macro]}
                min={0}
                max={1}
                defaultValue={0.5}
                color={MACRO_COLORS[macro]}
                size={52}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => edit((p) => { p.macros[macro] = v; })}
              />
            </div>
          ))}
        </div>

        {/* ── Built-in 1968 960 Step Sequencer / Arp Bar + 2-Octave Vintage Ivory/Ebony Audition Keyboard ── */}
        <div
          className="rounded-xl border border-[#E59A38]/20 p-3 flex flex-col gap-2.5"
          style={{ background: '#110E0B' }}
        >
          {/* Sequencer / Arp Header Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Volume2 size={13} style={{ color: AURA_ACCENT }} />
            <span className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-[#E59A38]/90 font-semibold">
              Audition Console & 960 Sequencer
            </span>

            <button
              onClick={() => edit((p) => { p.arp.enabled = !p.arp.enabled; })}
              className="h-6 px-2 rounded text-[9.5px] font-mono uppercase border transition-colors ml-1"
              style={patch.arp.enabled
                ? { borderColor: AURA_ACCENT, background: 'rgba(229,154,56,0.22)', color: '#FFD28A' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
            >
              {patch.arp.enabled ? '● 960 Arp/Seq On' : '○ Arp/Seq Off'}
            </button>

            {patch.arp.enabled && (
              <>
                <div className="flex items-center gap-1">
                  {(['up', 'upDown', 'octave', 'seq'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => edit((p) => { p.arp.mode = m; })}
                      className="h-5 px-1.5 rounded text-[8.5px] font-mono uppercase border"
                      style={patch.arp.mode === m
                        ? { borderColor: AURA_ACCENT, color: '#FFD28A', background: 'rgba(229,154,56,0.14)' }
                        : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.38)' }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {(['1/8', '1/8T', '1/16', '1/16T'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => edit((p) => { p.arp.rate = r; })}
                      className="h-5 px-1.5 rounded text-[8.5px] font-mono border"
                      style={patch.arp.rate === r
                        ? { borderColor: '#5CC9A7', color: '#5CC9A7', background: 'rgba(92,201,167,0.12)' }
                        : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.38)' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}

            <span className="flex-1" />

            {/* Latch / Hold & Octave Shift */}
            <button
              onClick={() => {
                if (latchMode) {
                  setLatchMode(false);
                  setHeldNote(null);
                } else {
                  setLatchMode(true);
                }
              }}
              className="h-6 px-2 rounded text-[9.5px] font-mono uppercase border"
              style={latchMode
                ? { borderColor: '#5CC9A7', background: 'rgba(92,201,167,0.18)', color: '#5CC9A7' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
              title="Latch keys so drones and 960 sequences keep playing hands-free"
            >
              {latchMode ? '◆ Key Hold On' : '◇ Key Hold'}
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setBaseOctave((o) => Math.max(1, o - 1))}
                className="h-6 px-1.5 rounded border border-white/10 text-[9.5px] font-mono text-white/55 hover:text-white"
              >
                -Oct
              </button>
              <span className="text-[9.5px] font-mono text-white/50 px-1">C{baseOctave}</span>
              <button
                onClick={() => setBaseOctave((o) => Math.min(5, o + 1))}
                className="h-6 px-1.5 rounded border border-white/10 text-[9.5px] font-mono text-white/55 hover:text-white"
              >
                +Oct
              </button>
            </div>
          </div>

          {/* 8-Stage 960 Step LEDs when Arp/Seq is enabled */}
          {patch.arp.enabled && (
            <div className="grid grid-cols-8 gap-1.5">
              {(patch.arp.steps || [0, 7, 12, 7, 0, 12, 7, 19]).slice(0, 8).map((st, idx) => {
                const isRunning = heldNote !== null && activeSeqStep === idx;
                return (
                  <div
                    key={idx}
                    className="rounded border px-1.5 py-1 flex items-center justify-between text-[9px] font-mono"
                    style={{
                      borderColor: isRunning ? AURA_ACCENT : 'rgba(255,255,255,0.08)',
                      background: isRunning ? 'rgba(229,154,56,0.22)' : 'rgba(0,0,0,0.35)',
                      color: isRunning ? '#FFD28A' : 'rgba(255,255,255,0.45)',
                    }}
                  >
                    <span>S{idx + 1}</span>
                    <span>{st > 0 ? `+${st}` : st}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2-Octave Vintage Ivory & Ebony Audition Keyboard */}
          <div className="flex items-stretch h-14 gap-0.5 pt-0.5">
            {KEYBOARD_NOTES.map((k) => {
              const midi = (baseOctave + 1) * 12 + k.semi;
              const isHeld = heldNote === midi;
              return (
                <button
                  key={k.semi}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (latchMode && heldNote === midi) {
                      setHeldNote(null);
                    } else {
                      setHeldNote(midi);
                    }
                  }}
                  onPointerUp={() => {
                    if (!latchMode) setHeldNote(null);
                  }}
                  onPointerLeave={() => {
                    if (!latchMode && heldNote === midi) setHeldNote(null);
                  }}
                  className="flex-1 rounded-b-md border flex flex-col items-center justify-end pb-1 transition-transform active:translate-y-[1px]"
                  style={
                    isHeld
                      ? {
                          background: 'linear-gradient(180deg, #F0B849 0%, #D9822B 100%)',
                          borderColor: '#FFD28A',
                          color: '#1A1108',
                          boxShadow: '0 0 12px rgba(229,154,56,0.55)',
                        }
                      : k.black
                      ? {
                          background: 'linear-gradient(180deg, #26221E 0%, #14110F 100%)',
                          borderColor: 'rgba(255,255,255,0.12)',
                          color: 'rgba(255,255,255,0.38)',
                          height: '78%',
                        }
                      : {
                          background: 'linear-gradient(180deg, #EAE2D3 0%, #CBBFA8 100%)',
                          borderColor: 'rgba(0,0,0,0.4)',
                          color: '#2B231B',
                        }
                  }
                  aria-label={`Audition note ${k.label}`}
                >
                  <span className="text-[8px] font-mono font-bold">
                    {k.semi % 12 === 0 ? `C${baseOctave + Math.floor(k.semi / 12)}` : k.black ? '' : k.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {editorOpen && (
        <AuraEditor track={track} onMutate={onMutate} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
};
