// AURA — 1960s & 1970s Vintage Voltage-Controlled Analogue Synthesizer Play Surface.
//
// Features:
// - Warm walnut/rosewood side-cheek trim & dark anodized bronze panel aesthetic
// - Real-Time Note-Reactive Amber Cathode-Ray Oscilloscope (CRO) with zero-crossing trigger lock
// - Interactive Multi-Parameter XY / CS-80 Vector Ribbon Controller (MorphPad)
// - 6 Front-Panel Vintage Macros (Warmth, Cutoff, Resonance, Vintage Aura, Ensemble, Tape Space)
// - 3-Module Vintage Performance FX Strip:
//     1. Pulse Gate (Tempo-Synced VCA / Lowpass Gate Chopper: Pulse, Saw Ramp, Probabilistic Random)
//     2. Tape & Ping-Pong Delay (Slapback, 1/8D Ping-Pong, RE-201 Space Echo, Dub Feedback)
//     3. Analog Flux (Buchla 266 Source of Uncertainty / Per-Note & Sustain Sample & Hold Randomness)
// - Built-in 1968 960-style 8-Step Sequencer / Arpeggiator + Pitch Bend & Mod Wheel Rollers + 2-Octave Keyboard
// - Full 56-Template Classic 1960s & 1970s Preset Browser with Era/Category tabs & A×B Crossform

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles, Sliders, Volume2, Dices } from 'lucide-react';
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
import { A, P, O, F, SP, RV, auraParamLabel, osc, flt } from '../../../../services/melos/instruments/aura/params';
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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiToName = (n: number) => `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
const midiToHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const STEP_SEMITONE_CYCLE = [0, 3, 5, 7, 10, 12, 15, 19, -5, -12];

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

  // Audition keyboard, Pitch/Mod wheels & 960 Sequencer state
  const [baseOctave, setBaseOctave] = useState(3);
  const [latchMode, setLatchMode] = useState(false);
  const [heldNotes, setHeldNotes] = useState<number[]>([]);
  const [activeSeqStep, setActiveSeqStep] = useState<number>(0);
  const [pitchBendUi, setPitchBendUi] = useState(0); // -1 .. +1
  const [modWheelUi, setModWheelUi] = useState(0);   // 0 .. 1

  const activeMidiNoteRef = useRef<number | null>(null);
  const pointerDownKeyRef = useRef<boolean>(false);

  // Deliberately not memoised — the GrooveDoc mutates in place.
  const patch: AuraPatch | null = deserializeAuraPatch(track.instrument?.patch);

  // Stable refs so sequencer timers and RAF loops never tear down on re-render
  const patchRef = useRef<AuraPatch | null>(patch);
  patchRef.current = patch;
  const trackRef = useRef<ArrangeTrack>(track);
  trackRef.current = track;
  const heldNotesRef = useRef<number[]>(heldNotes);
  heldNotesRef.current = heldNotes;

  // Ensure the WASM instrument is ready and patched on mount / track switch
  useEffect(() => {
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(trackRef.current).then((inst) => {
      if (inst && patchRef.current) {
        applyAuraPatch(inst, patchRef.current);
      }
    });
  }, [track.id]);

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
      patchRef.current = next;
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
      patchRef.current = next;
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
      patchRef.current = blended;
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

  /** Live XY Pad movement — sweeps multiple timbral parameters simultaneously & updates live scope */
  const padMove = useCallback((px: number, py: number, targetsX: PadTarget[], targetsY: PadTarget[]) => {
    const inst = BeatsEngine.get().getInstrument(track.id);
    const livePatch = patchRef.current;
    for (const t of targetsX) {
      const val = padValue(t, px);
      inst?.setParam(t.id, val);
      if (livePatch) livePatch.params[t.id] = val;
    }
    for (const t of targetsY) {
      const val = padValue(t, py);
      inst?.setParam(t.id, val);
      if (livePatch) livePatch.params[t.id] = val;
    }
    if (livePatch) {
      livePatch.padPos = [px, py];
    }
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
      // Keep Cutoff & Resonance macros aligned with the new XY position
      if (raw.macros && typeof raw.macros === 'object') {
        const rm = raw.macros as Record<string, number>;
        rm.cutoff = Math.max(0.05, Math.min(0.95, px));
        rm.resonance = Math.max(0.05, Math.min(0.92, py * 0.85));
      }
    });
  }, [onMutate, track.id]);

  // ── Pitch Bend & Mod Wheel handlers ──
  const handlePitchBend = useCallback((bend: number) => {
    const clamped = Math.max(-1, Math.min(1, bend));
    setPitchBendUi(clamped);
    BeatsEngine.get().setInstrumentPitchBend(trackRef.current, clamped);
  }, []);

  const handleModWheel = useCallback((mod: number) => {
    const clamped = Math.max(0, Math.min(1, mod));
    setModWheelUi(clamped);
    BeatsEngine.get().setInstrumentModWheel(trackRef.current, clamped);
  }, []);

  // ── Audition Note Triggering & 1968 960 Step Sequencer / Arpeggiator Clock ──
  const stopCurrentMidiNote = useCallback(() => {
    if (activeMidiNoteRef.current !== null) {
      BeatsEngine.get().instrumentNoteOff(trackRef.current, activeMidiNoteRef.current);
      activeMidiNoteRef.current = null;
    }
  }, []);

  const triggerNoteOn = useCallback((midiNote: number, velocity = 110) => {
    const engine = BeatsEngine.get();
    const trk = trackRef.current;
    const inst = engine.getInstrument(trk.id);
    if (!inst) {
      void engine.ensureInstrument(trk).then((loaded) => {
        if (loaded && patchRef.current) applyAuraPatch(loaded, patchRef.current);
        if (activeMidiNoteRef.current !== null && activeMidiNoteRef.current !== midiNote) {
          engine.instrumentNoteOff(trk, activeMidiNoteRef.current);
        }
        activeMidiNoteRef.current = midiNote;
        engine.instrumentNoteOn(trk, midiNote, velocity);
      });
      return;
    }
    if (activeMidiNoteRef.current !== null && activeMidiNoteRef.current !== midiNote) {
      engine.instrumentNoteOff(trk, activeMidiNoteRef.current);
    }
    activeMidiNoteRef.current = midiNote;
    engine.instrumentNoteOn(trk, midiNote, velocity);
  }, []);

  const arpEnabled = !!patch?.arp?.enabled;
  const arpMode = patch?.arp?.mode ?? 'up';
  const arpRate = patch?.arp?.rate ?? '1/16';
  const arpGate = patch?.arp?.gate ?? 0.62;
  const arpOctaves = patch?.arp?.octaves ?? 2;
  const arpStepsKey = (patch?.arp?.steps ?? [0, 7, 12, 7, 0, 10, 7, 12]).join(',');

  // Run the 960 Step Sequencer / Arpeggiator when notes are held and arp.enabled is true
  useEffect(() => {
    if (heldNotes.length === 0) {
      stopCurrentMidiNote();
      return;
    }
    if (!arpEnabled) {
      const latestNote = heldNotes[heldNotes.length - 1];
      triggerNoteOn(latestNote);
      return () => {
        stopCurrentMidiNote();
      };
    }

    const bpm = Math.max(40, Math.min(240, doc.bpm || 120));
    const beatMs = 60000 / bpm;
    const rateMul = arpRate === '1/4' ? 1
      : arpRate === '1/8' ? 0.5
      : arpRate === '1/8T' ? 1 / 3
      : arpRate === '1/16T' ? 1 / 6
      : 0.25; // '1/16'
    const stepMs = Math.max(50, beatMs * rateMul);
    const gateMs = Math.max(28, stepMs * Math.max(0.18, Math.min(0.92, arpGate)));

    let idx = 0;
    let gateTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const notes = heldNotesRef.current;
      if (!notes || notes.length === 0) return;
      const steps = patchRef.current?.arp?.steps?.length
        ? patchRef.current.arp.steps
        : [0, 7, 12, 7, 0, 10, 7, 12];
      const stepIdx = idx % steps.length;
      setActiveSeqStep(stepIdx);

      const sorted = [...notes].sort((a, b) => a - b);
      let note = sorted[0];

      if (arpMode === 'seq' || sorted.length === 1) {
        // Classic Moog 960 / Synthi AKS 8-stage semitone sequence anchored to root note
        const root = sorted[0];
        let offset = steps[stepIdx] ?? 0;
        if (arpMode === 'octave') {
          offset = (stepIdx % Math.max(2, arpOctaves)) * 12;
        } else if (arpMode === 'down') {
          offset = steps[(steps.length - 1 - stepIdx) % steps.length] ?? 0;
        } else if (arpMode === 'upDown') {
          const cycle = steps.length * 2 - 2;
          const pos = idx % Math.max(1, cycle);
          const mirror = pos < steps.length ? pos : cycle - pos;
          offset = steps[mirror] ?? 0;
        } else if (arpMode === 'random') {
          offset = steps[Math.floor(Math.random() * steps.length)] ?? 0;
        }
        note = root + offset;
      } else {
        // Multi-note chord arpeggiation across octaves
        const expandedPool: number[] = [];
        const octCount = Math.max(1, Math.min(3, arpOctaves));
        for (let o = 0; o < octCount; o++) {
          for (const n of sorted) expandedPool.push(n + o * 12);
        }
        if (arpMode === 'up') {
          note = expandedPool[idx % expandedPool.length];
        } else if (arpMode === 'down') {
          note = expandedPool[(expandedPool.length - 1 - (idx % expandedPool.length))];
        } else if (arpMode === 'upDown') {
          const cycle = Math.max(1, expandedPool.length * 2 - 2);
          const pos = idx % cycle;
          const mirror = pos < expandedPool.length ? pos : cycle - pos;
          note = expandedPool[mirror] ?? expandedPool[0];
        } else if (arpMode === 'octave') {
          const base = sorted[idx % sorted.length];
          const oct = Math.floor(idx / sorted.length) % Math.max(2, octCount);
          note = base + oct * 12;
        } else {
          note = expandedPool[Math.floor(Math.random() * expandedPool.length)];
        }
      }

      const clampedNote = Math.max(24, Math.min(96, Math.round(note)));
      const vel = 96 + ((stepIdx % 2 === 0) ? 18 : 0);
      triggerNoteOn(clampedNote, vel);

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
  }, [
    heldNotes,
    arpEnabled,
    arpMode,
    arpRate,
    arpGate,
    arpOctaves,
    arpStepsKey,
    doc.bpm,
    stopCurrentMidiNote,
    triggerNoteOn,
  ]);

  // Clean up any hanging note on unmount
  useEffect(() => () => stopCurrentMidiNote(), [stopCurrentMidiNote]);

  // Release non-latched notes on global pointerup
  useEffect(() => {
    const onUp = () => {
      if (pointerDownKeyRef.current) {
        pointerDownKeyRef.current = false;
        if (!latchMode) setHeldNotes([]);
      }
    };
    window.addEventListener('pointerup', onUp);
    return () => window.removeEventListener('pointerup', onUp);
  }, [latchMode]);

  // ── Real-Time Note-Reactive Amber Cathode-Ray Oscilloscope (CRO) ──
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scopeReadoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    const pcmBuf = new Float32Array(1024);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const curPatch = patchRef.current;
      if (!curPatch) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const inst = BeatsEngine.get().getInstrument(trackRef.current.id);
      const liveHeld = inst ? inst.heldNoteNumbers() : [];
      const activeNotes = liveHeld.length > 0 ? liveHeld : heldNotesRef.current;
      const isNotePlaying = activeNotes.length > 0 || activeMidiNoteRef.current !== null;
      const currentMidi = activeMidiNoteRef.current
        ?? (activeNotes.length > 0 ? activeNotes[activeNotes.length - 1] : (inst?.lastNote ?? 60));

      // Sync hardware MIDI Pitch Bend & Mod Wheel to UI indicators when changed externally
      if (inst) {
        if (Math.abs(inst.pitchBendValue - pitchBendUi) > 0.02) {
          setPitchBendUi(inst.pitchBendValue);
        }
        if (Math.abs(inst.modWheelValue - modWheelUi) > 0.02) {
          setModWheelUi(inst.modWheelValue);
        }
      }

      const prm = curPatch.params;
      const bendRangeSt = Math.max(1, Math.round((prm[P.BEND_RANGE] ?? (2 / 24)) * 24));
      const totalBendSt = (inst?.pitchBendValue ?? pitchBendUi) * bendRangeSt;
      const modWheel = inst?.modWheelValue ?? modWheelUi;
      const noteFreq = midiToHz(currentMidi + totalBendSt);

      // Update live note/frequency badge
      if (scopeReadoutRef.current) {
        if (isNotePlaying) {
          const chordStr = activeNotes.length > 1
            ? `${activeNotes.map(midiToName).join('+')} (${Math.round(noteFreq)} Hz)`
            : `${midiToName(currentMidi)} · ${noteFreq.toFixed(1)} Hz`;
          const bendStr = Math.abs(totalBendSt) > 0.08 ? ` · BEND ${totalBendSt > 0 ? '+' : ''}${totalBendSt.toFixed(1)}st` : '';
          const modStr = modWheel > 0.03 ? ` · MOD ${Math.round(modWheel * 100)}%` : '';
          scopeReadoutRef.current.textContent = `● ${chordStr}${bendStr}${modStr}`;
        } else {
          scopeReadoutRef.current.textContent = `STANDBY · LAST ${midiToName(currentMidi)} (${noteFreq.toFixed(0)} Hz)`;
        }
      }

      // Read real-time PCM samples from the Instrument AnalyserNode
      const peak = inst ? inst.readWaveform(pcmBuf) : 0;

      // Phosphor persistence fade
      ctx.fillStyle = isNotePlaying ? 'rgba(11, 9, 7, 0.28)' : 'rgba(11, 9, 7, 0.36)';
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

      const cutoff = Math.min(1, (prm[flt(0, F.CUTOFF)] ?? 0.55) + modWheel * 0.22);
      const res = prm[flt(0, F.RES)] ?? 0.25;
      const syncOn = (prm[A.OSC_SYNC] ?? 0) > 0.15;
      const syncAmt = prm[A.OSC_SYNC] ?? 0;
      const xmodP = (prm[A.XMOD_PITCH] ?? 0) + modWheel * 0.15;
      const xmodF = prm[A.XMOD_FILTER] ?? 0;
      const ringMod = prm[A.RING_MOD] ?? 0;
      const auraAmt = prm[A.AURA] ?? 0.35;
      const warmth = prm[A.WARMTH] ?? 0.35;
      const ensOn = (prm[A.ENS_ON] ?? 0) > 0.5;
      const ensMix = ensOn ? (prm[A.ENS_MIX] ?? 0.5) : 0;
      const phOn = (prm[A.PH_ON] ?? 0) > 0.5;
      const gateOn = (prm[A.GATE_ON] ?? 0) > 0.5;
      const gateRate = prm[A.GATE_RATE] ?? 0.5;
      const gateDepth = prm[A.GATE_DEPTH] ?? 0.72;
      const fluxOn = (prm[A.FLUX_ON] ?? 0) > 0.5;
      const fluxAmt = prm[A.FLUX_AMT] ?? 0.45;

      // Advance phase proportional to played note frequency!
      const freqRatio = Math.max(0.35, Math.min(6.0, noteFreq / 130.81));
      phase += 0.028 * (isNotePlaying ? freqRatio : 0.65);

      // If we have live audio above noise floor, lock to rising zero-crossing and draw real PCM!
      if (peak > 0.008) {
        let trigIdx = 0;
        const searchLimit = Math.floor(pcmBuf.length * 0.5);
        for (let i = 1; i < searchLimit; i++) {
          if (pcmBuf[i - 1] <= 0 && pcmBuf[i] > 0) {
            trigIdx = i;
            break;
          }
        }
        const span = Math.min(pcmBuf.length - trigIdx, 384);
        const gainNorm = Math.min(3.2, 0.82 / Math.max(0.18, peak));

        // Optional BBD Ensemble stereo ghost trace
        if (ensMix > 0.05) {
          ctx.beginPath();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = 'rgba(92, 201, 167, 0.55)';
          ctx.shadowColor = '#5CC9A7';
          ctx.shadowBlur = 5;
          for (let px = 0; px < w; px++) {
            const idx = trigIdx + Math.min(span - 1, Math.floor(((px / w) * span + 10) % span));
            const s = Math.tanh((pcmBuf[idx] ?? 0) * gainNorm);
            const y = h * 0.5 - s * (h * 0.40);
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }

        // Primary live cathode-ray beam
        ctx.beginPath();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#FFD27D';
        ctx.shadowColor = '#E59A38';
        ctx.shadowBlur = 12;
        for (let px = 0; px < w; px++) {
          const samplePos = trigIdx + (px / w) * (span - 1);
          const i0 = Math.floor(samplePos);
          const frac = samplePos - i0;
          const rawS = (pcmBuf[i0] ?? 0) * (1 - frac) + (pcmBuf[i0 + 1] ?? 0) * frac;
          const s = Math.tanh(rawS * gainNorm);
          const y = h * 0.5 - s * (h * 0.41);
          if (px === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Standby / synthetic preview trace scaled by note pitch, bend, mod wheel, gate & flux
        const wave1 = (prm[osc(0, O.MODE)] ?? 1) < 0.5 ? 4 : Math.round(prm[osc(0, O.ANALOG_SHAPE)] ?? 0);
        const semi2 = (prm[osc(1, O.COARSE)] ?? 0.5) * 48 - 24;
        const ratio2 = Math.pow(2, semi2 / 12);
        const cycles = Math.max(1.2, Math.min(8.5, 2.2 * freqRatio));

        const gateEnv = gateOn
          ? (1 - gateDepth * 0.85 * (Math.sin(phase * (2.5 + gateRate * 8)) > 0 ? 0 : 1))
          : 1;
        const fluxJitter = fluxOn ? Math.sin(phase * 3.7) * Math.cos(phase * 2.3) * fluxAmt * 0.45 : 0;

        const traces = ensMix > 0.05 ? 2 : 1;
        for (let tr = traces - 1; tr >= 0; tr--) {
          ctx.beginPath();
          ctx.lineWidth = tr === 0 ? (isNotePlaying ? 2.4 : 1.9) : 1.3;
          ctx.strokeStyle = tr === 0
            ? (isNotePlaying ? '#FFD27D' : '#E59A38')
            : 'rgba(92, 201, 167, 0.55)';
          ctx.shadowColor = tr === 0 ? '#E59A38' : '#5CC9A7';
          ctx.shadowBlur = tr === 0 ? (isNotePlaying ? 12 : 7) : 4;

          const bbdOffset = tr === 1 ? Math.sin(phase * 1.7) * 0.35 * ensMix : 0;
          const driftWobble = Math.sin(phase * 0.43) * auraAmt * 0.12 + Math.sin(phase * 2.8) * modWheel * 0.18 + fluxJitter;

          for (let px = 0; px < w; px++) {
            const normX = px / w;
            const p2 = (normX * cycles * ratio2 + phase * 0.5 + bbdOffset) * Math.PI * 2;
            const osc2 = Math.sin(p2);

            let t1 = normX * cycles + phase * 0.35 + driftWobble + bbdOffset;
            if (syncOn) {
              const slaveMul = 1.6 + syncAmt * 2.8 + Math.max(0.5, ratio2);
              t1 = ((normX * cycles) % 1) * slaveMul + phase * 0.25;
            }
            const p1 = t1 * Math.PI * 2 + osc2 * xmodP * 4.5;

            let s1 = 0;
            if (wave1 === 0) {
              s1 = Math.sin(p1) + 0.5 * cutoff * Math.sin(2 * p1) + 0.33 * cutoff * cutoff * Math.sin(3 * p1);
            } else if (wave1 === 1) {
              s1 = Math.tanh(Math.sin(p1) * (2.5 + cutoff * 4));
            } else if (wave1 === 2) {
              s1 = Math.asin(Math.sin(p1)) * (2 / Math.PI);
            } else {
              s1 = Math.sin(p1 + Math.sin(p1 * 2) * (0.4 + warmth * 0.8));
            }

            let sig = s1 * (1 - ringMod * 0.75) + (s1 * osc2) * (ringMod * 0.95);
            const resFreq = (3 + cutoff * 9 + fluxJitter * 6 + osc2 * xmodF * 4) * normX * Math.PI * 2;
            sig += Math.sin(resFreq + phase) * res * 0.42 * Math.exp(-((normX * cycles) % 1) * 2.3);

            if (phOn) {
              sig *= 0.75 + 0.25 * Math.cos(normX * 6 + phase * 1.4);
            }
            sig = Math.tanh(sig * (0.85 + warmth * 0.95)) * gateEnv;
            const ampScale = isNotePlaying ? 0.39 : 0.26;
            const y = h * 0.5 - sig * (h * ampScale);
            if (px === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [pitchBendUi, modWheelUi]);

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
  const syncActive = (prm[A.OSC_SYNC] ?? 0) > 0.25;
  const xmodActive = (prm[A.XMOD_PITCH] ?? 0) > 0.04 || (prm[A.XMOD_FILTER] ?? 0) > 0.04;
  const ringActive = (prm[A.RING_MOD] ?? 0) > 0.04;
  const ensActive = (prm[A.ENS_ON] ?? 0) > 0.5;
  const phActive = (prm[A.PH_ON] ?? 0) > 0.5;
  const tapeActive = (prm[A.TAPE_SAT] ?? 0) > 0.15;

  // Performance FX Strip states
  const gateOn = (prm[A.GATE_ON] ?? 0) > 0.5;
  const gateShape = Math.round(prm[A.GATE_SHAPE] ?? 0);
  const gateRate = prm[A.GATE_RATE] ?? 0.5;
  const gateDepth = prm[A.GATE_DEPTH] ?? 0.72;

  const delayOn = (prm[SP.EC_ON] ?? 0) > 0.5 || (prm[SP.DL_ON] ?? 0) > 0.5;
  const delayMix = Math.max(prm[SP.EC_MIX] ?? 0, prm[SP.DL_MIX] ?? 0, 0.28);
  const delayFb = Math.max(prm[SP.EC_FB] ?? 0, prm[SP.DL_FB] ?? 0, 0.42);

  const fluxOn = (prm[A.FLUX_ON] ?? 0) > 0.5;
  const fluxMode = Math.round(prm[A.FLUX_MODE] ?? 0);
  const fluxAmt = prm[A.FLUX_AMT] ?? 0.45;
  const fluxRate = prm[A.FLUX_RATE] ?? 0.42;

  return (
    <div
      className="melos-instr flex flex-col h-full min-h-0 select-none"
      style={{
        background: SURFACE,
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
          className="flex items-center gap-2 text-left hover:opacity-90 shrink-0 max-w-[60%] min-w-0"
          title="Browse all 56 classic 1960s & 1970s templates"
        >
          <span className="text-[12.5px] font-semibold text-white truncate" title={patch.name}>{patch.name}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider flex-none"
            style={{ background: 'rgba(229,154,56,0.18)', color: '#FFD28A', border: '1px solid rgba(229,154,56,0.35)' }}
          >
            {patch.year}
          </span>
        </button>

        <span className="text-[10.5px] text-white/40 truncate hidden md:inline min-w-0" title={patch.inspiration}>
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-2.5 [&>*]:shrink-0">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-max gap-2 max-h-80 overflow-y-auto pr-1">
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
                      <span className="text-[12px] font-semibold text-white leading-tight line-clamp-2" title={pr.name}>{pr.name}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold flex-none"
                        style={{ background: 'rgba(229,154,56,0.18)', color: '#FFD28A' }}
                      >
                        {pr.year}
                      </span>
                    </div>
                    <div className="text-[9.5px] font-mono text-[#E59A38]/80 truncate" title={pr.inspiration}>
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

        {/* ── Hero Row: Real-Time Note-Reactive Oscilloscope + Circuit Lamps + XY Vector Pad ── */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_230px] gap-3 items-stretch">
          {/* Left: Amber Cathode-Ray Scope + Circuit Status Lamps + Vintage Calibration Strip */}
          <div
            className="rounded-xl border border-[#E59A38]/25 p-3 flex flex-col justify-between gap-2"
            style={{
              background: 'radial-gradient(120% 100% at 50% 0%, #1D150E 0%, #0D0A08 100%)',
              boxShadow: 'inset 0 2px 18px rgba(0,0,0,0.75)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#E59A38] shadow-[0_0_8px_#E59A38]" />
                <span className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-[#E59A38]/85">
                  Cathode-Ray Signal Monitor
                </span>
              </div>
              {/* Active Circuit Indicator Lamps — each click engages distinct, musical parameters */}
              <div className="flex flex-wrap items-center gap-1">
                {[
                  {
                    label: 'HARD SYNC',
                    on: syncActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.OSC_SYNC] ?? 0) > 0.25);
                      p.params[A.OSC_SYNC] = nextOn ? 1 : 0;
                      if (nextOn) {
                        p.params[osc(1, O.ENABLE)] = 1;
                        p.params[osc(1, O.LEVEL)] = Math.max(p.params[osc(1, O.LEVEL)] ?? 0, 0.72);
                        if (Math.abs((p.params[osc(1, O.COARSE)] ?? 0.5) - 0.5) < 0.02) {
                          p.params[osc(1, O.COARSE)] = 0.5 + 7 / 48;
                        }
                      }
                    },
                  },
                  {
                    label: 'X-MOD',
                    on: xmodActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.XMOD_PITCH] ?? 0) > 0.04 || (p.params[A.XMOD_FILTER] ?? 0) > 0.04);
                      p.params[A.XMOD_PITCH] = nextOn ? 0.36 : 0;
                      p.params[A.XMOD_FILTER] = nextOn ? 0.48 : 0;
                      if (nextOn) p.params[osc(1, O.ENABLE)] = 1;
                    },
                  },
                  {
                    label: 'RING MOD',
                    on: ringActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.RING_MOD] ?? 0) > 0.04);
                      p.params[A.RING_MOD] = nextOn ? 0.62 : 0;
                      if (nextOn) p.params[osc(1, O.ENABLE)] = 1;
                    },
                  },
                  {
                    label: 'SOLINA BBD',
                    on: ensActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.ENS_ON] ?? 0) > 0.5);
                      p.params[A.ENS_ON] = nextOn ? 1 : 0;
                      if (nextOn) {
                        p.params[A.ENS_MIX] = Math.max(p.params[A.ENS_MIX] ?? 0, 0.58);
                        p.params[A.ENS_DEPTH] = Math.max(p.params[A.ENS_DEPTH] ?? 0, 0.65);
                        p.macros.ensemble = Math.max(p.macros.ensemble, 0.58);
                      } else if ((p.params[A.PH_ON] ?? 0) <= 0.5) {
                        p.macros.ensemble = 0;
                      }
                    },
                  },
                  {
                    label: '6-STG PHASER',
                    on: phActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.PH_ON] ?? 0) > 0.5);
                      p.params[A.PH_ON] = nextOn ? 1 : 0;
                      if (nextOn) {
                        p.params[A.PH_MIX] = Math.max(p.params[A.PH_MIX] ?? 0, 0.55);
                        p.params[A.PH_DEPTH] = Math.max(p.params[A.PH_DEPTH] ?? 0, 0.75);
                        p.params[A.PH_FEEDBACK] = Math.max(p.params[A.PH_FEEDBACK] ?? 0, 0.62);
                      }
                    },
                  },
                  {
                    label: '15 IPS TAPE',
                    on: tapeActive,
                    toggle: (p: AuraPatch) => {
                      const nextOn = !((p.params[A.TAPE_SAT] ?? 0) > 0.15);
                      p.params[A.TAPE_SAT] = nextOn ? 0.62 : 0.05;
                    },
                  },
                ].map((lamp) => (
                  <button
                    key={lamp.label}
                    onClick={() => edit(lamp.toggle)}
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
                height={104}
                className="w-full h-[104px] block"
              />
              {/* Top-left / Top-right Live Pitch & Trigger Readout */}
              <div className="absolute top-1.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none text-[9px] font-mono">
                <span className="text-[#FFD28A]/85 font-semibold" ref={scopeReadoutRef}>
                  STANDBY · PLAY A NOTE
                </span>
                <span className="text-[#5CC9A7]/80">
                  {gateOn ? 'GATE CHOP · ' : ''}{fluxOn ? 'FLUX S&H · ' : ''}{delayOn ? 'ECHO ON' : ''}
                </span>
              </div>
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
              <p className="text-[10.5px] text-white/45 leading-snug line-clamp-2 max-w-[62%]" title={patch.description}>
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

          {/* Right: XY / Ribbon Vector Expression Controller */}
          <div className="flex flex-col justify-between">
            <MorphPad
              x={patch.padPos[0]}
              y={patch.padPos[1]}
              targetsX={patch.padX}
              targetsY={patch.padY}
              labelX={labelAxis(patch.padX, 'Cutoff + Drive')}
              labelY={labelAxis(patch.padY, 'Reso + Aura')}
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

        {/* ── 6 Front-Panel Vintage Macro Pots (Directly Coupled to Circuit Parameters) ── */}
        <div
          className="rounded-xl border border-white/10 p-2.5 grid grid-cols-3 sm:grid-cols-6 gap-2"
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
                size={48}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => edit((p) => {
                  p.macros[macro] = v;
                  if (macro === 'cutoff') p.params[flt(0, F.CUTOFF)] = Math.max(0.04, Math.min(0.98, v));
                  if (macro === 'resonance') p.params[flt(0, F.RES)] = Math.max(0, Math.min(0.94, v));
                  if (macro === 'warmth') {
                    p.params[A.WARMTH] = v;
                    p.params[flt(0, F.DRIVE)] = v * 0.75;
                  }
                  if (macro === 'aura') {
                    p.params[A.AURA] = v;
                    p.params[P.ANALOG_DRIFT] = v * 0.78;
                  }
                  if (macro === 'ensemble') {
                    p.params[A.ENS_ON] = v > 0.04 ? 1 : 0;
                    p.params[A.ENS_MIX] = v * 0.85;
                  }
                  if (macro === 'space') {
                    p.params[RV.MIX] = v * 0.65;
                    if (v > 0.35) {
                      p.params[SP.EC_ON] = 1;
                      p.params[SP.EC_MIX] = (v - 0.2) * 0.55;
                    }
                  }
                })}
              />
            </div>
          ))}
        </div>

        {/* ── 3-Module Vintage Performance FX Strip: Pulse Gate · Tape/Ping-Pong Delay · Analog Flux (Randomness) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {/* 1. Rhythmic VCA / Lowpass Gate Chopper */}
          <div
            className="rounded-xl border p-2.5 flex flex-col gap-2"
            style={{
              borderColor: gateOn ? 'rgba(229,154,56,0.45)' : 'rgba(255,255,255,0.09)',
              background: gateOn ? 'rgba(229,154,56,0.07)' : 'rgba(0,0,0,0.28)',
            }}
          >
            <div className="flex items-center justify-between gap-1.5">
              <button
                onClick={() => edit((p) => {
                  const next = !((p.params[A.GATE_ON] ?? 0) > 0.5);
                  p.params[A.GATE_ON] = next ? 1 : 0;
                  if (next && (p.params[A.GATE_DEPTH] ?? 0) < 0.2) p.params[A.GATE_DEPTH] = 0.75;
                })}
                className="px-2 py-0.5 rounded text-[9.5px] font-mono uppercase tracking-wider border font-semibold transition-colors"
                style={gateOn
                  ? { borderColor: '#E59A38', background: 'rgba(229,154,56,0.22)', color: '#FFD28A' }
                  : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
              >
                {gateOn ? '● Pulse Gate On' : '○ Pulse Gate'}
              </button>
              <div className="flex items-center gap-1">
                {(['Pulse', 'Saw', 'Rnd'] as const).map((lbl, idx) => (
                  <button
                    key={lbl}
                    onClick={() => edit((p) => {
                      p.params[A.GATE_ON] = 1;
                      p.params[A.GATE_SHAPE] = idx;
                    })}
                    className="px-1.5 py-0.5 rounded text-[8.5px] font-mono border"
                    style={gateOn && gateShape === idx
                      ? { borderColor: '#E59A38', color: '#FFD28A', background: 'rgba(229,154,56,0.16)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.38)' }}
                    title={idx === 2 ? 'Probabilistic random step gate as notes sustain' : `${lbl} VCA/Lowpass Gate`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-mono text-white/50">
              <span>Rate</span>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.01}
                value={gateRate}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => { p.params[A.GATE_ON] = 1; p.params[A.GATE_RATE] = v; });
                }}
                className="flex-1 accent-[#E59A38] h-1.5 cursor-pointer"
                aria-label="Pulse Gate Rate"
              />
              <span>Chop</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={gateDepth}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => { p.params[A.GATE_ON] = 1; p.params[A.GATE_DEPTH] = v; });
                }}
                className="w-20 accent-[#E59A38] h-1.5 cursor-pointer"
                aria-label="Pulse Gate Depth"
              />
            </div>
          </div>

          {/* 2. Tape Echo & Stereo Ping-Pong Delay */}
          <div
            className="rounded-xl border p-2.5 flex flex-col gap-2"
            style={{
              borderColor: delayOn ? 'rgba(99,184,222,0.45)' : 'rgba(255,255,255,0.09)',
              background: delayOn ? 'rgba(99,184,222,0.07)' : 'rgba(0,0,0,0.28)',
            }}
          >
            <div className="flex items-center justify-between gap-1.5">
              <button
                onClick={() => edit((p) => {
                  const next = !delayOn;
                  p.params[SP.EC_ON] = next ? 1 : 0;
                  p.params[SP.DL_ON] = next ? 1 : 0;
                  if (next) {
                    p.params[SP.EC_MIX] = Math.max(p.params[SP.EC_MIX] ?? 0, 0.32);
                    p.params[SP.DL_MIX] = Math.max(p.params[SP.DL_MIX] ?? 0, 0.28);
                  }
                })}
                className="px-2 py-0.5 rounded text-[9.5px] font-mono uppercase tracking-wider border font-semibold transition-colors"
                style={delayOn
                  ? { borderColor: '#63B8DE', background: 'rgba(99,184,222,0.22)', color: '#B8E7FA' }
                  : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
              >
                {delayOn ? '● Tape Delay On' : '○ Tape Delay'}
              </button>
              <div className="flex items-center gap-1">
                {([
                  { lbl: 'Slap', time: 0.12, fb: 0.28, ping: 0, div: 0.2 },
                  { lbl: '1/8D', time: 0.34, fb: 0.48, ping: 1, div: 0.45 },
                  { lbl: 'Space', time: 0.48, fb: 0.62, ping: 1, div: 0.65 },
                  { lbl: 'Dub', time: 0.64, fb: 0.82, ping: 1, div: 0.8 },
                ] as const).map((preset) => (
                  <button
                    key={preset.lbl}
                    onClick={() => edit((p) => {
                      p.params[SP.EC_ON] = 1;
                      p.params[SP.DL_ON] = 1;
                      p.params[SP.EC_TIME] = preset.time;
                      p.params[SP.EC_FB] = preset.fb;
                      p.params[SP.DL_DIV] = preset.div;
                      p.params[SP.DL_FB] = preset.fb;
                      p.params[SP.DL_PING] = preset.ping;
                      p.params[SP.EC_MIX] = Math.max(p.params[SP.EC_MIX] ?? 0, 0.34);
                      p.params[SP.DL_MIX] = Math.max(p.params[SP.DL_MIX] ?? 0, 0.30);
                    })}
                    className="px-1.5 py-0.5 rounded text-[8.5px] font-mono border border-white/10 text-white/50 hover:text-[#B8E7FA] hover:border-[#63B8DE]/50"
                  >
                    {preset.lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-mono text-white/50">
              <span>Mix</span>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.01}
                value={delayMix}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => {
                    p.params[SP.EC_ON] = 1;
                    p.params[SP.DL_ON] = 1;
                    p.params[SP.EC_MIX] = v;
                    p.params[SP.DL_MIX] = v * 0.85;
                  });
                }}
                className="flex-1 accent-[#63B8DE] h-1.5 cursor-pointer"
                aria-label="Delay Mix"
              />
              <span>Fdbk</span>
              <input
                type="range"
                min={0.05}
                max={0.92}
                step={0.01}
                value={delayFb}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => {
                    p.params[SP.EC_ON] = 1;
                    p.params[SP.DL_ON] = 1;
                    p.params[SP.EC_FB] = v;
                    p.params[SP.DL_FB] = v;
                  });
                }}
                className="w-20 accent-[#63B8DE] h-1.5 cursor-pointer"
                aria-label="Delay Feedback"
              />
            </div>
          </div>

          {/* 3. Analog Flux — Per-Note & Sustain Randomness (Buchla 266 Source of Uncertainty) */}
          <div
            className="rounded-xl border p-2.5 flex flex-col gap-2"
            style={{
              borderColor: fluxOn ? 'rgba(92,201,167,0.45)' : 'rgba(255,255,255,0.09)',
              background: fluxOn ? 'rgba(92,201,167,0.07)' : 'rgba(0,0,0,0.28)',
            }}
          >
            <div className="flex items-center justify-between gap-1.5">
              <button
                onClick={() => edit((p) => {
                  const next = !((p.params[A.FLUX_ON] ?? 0) > 0.5);
                  p.params[A.FLUX_ON] = next ? 1 : 0;
                  if (next && (p.params[A.FLUX_AMT] ?? 0) < 0.15) p.params[A.FLUX_AMT] = 0.52;
                })}
                className="px-2 py-0.5 rounded text-[9.5px] font-mono uppercase tracking-wider border font-semibold transition-colors"
                style={fluxOn
                  ? { borderColor: '#5CC9A7', background: 'rgba(92,201,167,0.22)', color: '#A8F0D8' }
                  : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
                title="Triggers organic per-note & sustain randomness (Buchla 266 Source of Uncertainty / Sample & Hold)"
              >
                {fluxOn ? '● Analog Flux On' : '○ Analog Flux'}
              </button>
              <div className="flex items-center gap-1">
                {(['S&H', 'Drift', 'Cosmic'] as const).map((lbl, idx) => (
                  <button
                    key={lbl}
                    onClick={() => edit((p) => {
                      p.params[A.FLUX_ON] = 1;
                      p.params[A.FLUX_MODE] = idx;
                    })}
                    className="px-1.5 py-0.5 rounded text-[8.5px] font-mono border"
                    style={fluxOn && fluxMode === idx
                      ? { borderColor: '#5CC9A7', color: '#A8F0D8', background: 'rgba(92,201,167,0.16)' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.38)' }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-mono text-white/50">
              <span>Flux</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={fluxAmt}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => { p.params[A.FLUX_ON] = 1; p.params[A.FLUX_AMT] = v; });
                }}
                className="flex-1 accent-[#5CC9A7] h-1.5 cursor-pointer"
                aria-label="Analog Flux Depth"
              />
              <span>Clock</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={fluxRate}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  edit((p) => { p.params[A.FLUX_ON] = 1; p.params[A.FLUX_RATE] = v; });
                }}
                className="w-20 accent-[#5CC9A7] h-1.5 cursor-pointer"
                aria-label="Analog Flux Clock Rate"
              />
            </div>
          </div>
        </div>

        {/* ── Built-in 1968 960 Step Sequencer / Arp Bar + Pitch/Mod Wheels + 2-Octave Audition Keyboard ── */}
        <div
          className="rounded-xl border border-[#E59A38]/20 p-3 flex flex-col gap-2"
          style={{ background: '#110E0B' }}
        >
          {/* Sequencer / Arp Header Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Volume2 size={13} style={{ color: AURA_ACCENT }} />
            <span className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-[#E59A38]/90 font-semibold">
              Performance Console & 960 Sequencer
            </span>

            <button
              onClick={() => edit((p) => { p.arp.enabled = !p.arp.enabled; })}
              className="h-6 px-2.5 rounded text-[9.5px] font-mono uppercase border transition-colors ml-1"
              style={patch.arp.enabled
                ? { borderColor: AURA_ACCENT, background: 'rgba(229,154,56,0.22)', color: '#FFD28A' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
            >
              {patch.arp.enabled ? '● 960 Arp/Seq On' : '○ Arp/Seq Off'}
            </button>

            <div className="flex items-center gap-1">
              {(['up', 'down', 'upDown', 'octave', 'random', 'seq'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => edit((p) => { p.arp.enabled = true; p.arp.mode = m; })}
                  className="h-5 px-1.5 rounded text-[8.5px] font-mono uppercase border"
                  style={patch.arp.enabled && patch.arp.mode === m
                    ? { borderColor: AURA_ACCENT, color: '#FFD28A', background: 'rgba(229,154,56,0.14)' }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.38)' }}
                >
                  {m === 'seq' ? '960 Seq' : m === 'random' ? 'rnd' : m}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {(['1/4', '1/8', '1/8T', '1/16', '1/16T'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => edit((p) => { p.arp.enabled = true; p.arp.rate = r; })}
                  className="h-5 px-1.5 rounded text-[8.5px] font-mono border"
                  style={patch.arp.rate === r
                    ? { borderColor: '#5CC9A7', color: '#5CC9A7', background: 'rgba(92,201,167,0.12)' }
                    : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.38)' }}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              onClick={() => edit((p) => {
                const pool = [0, 0, 3, 5, 7, 10, 12, 15, -5];
                p.arp.enabled = true;
                p.arp.mode = 'seq';
                p.arp.steps = Array.from({ length: 8 }, (_, i) =>
                  i === 0 ? 0 : pool[Math.floor(Math.random() * pool.length)]
                );
              })}
              className="h-5 px-2 rounded border border-white/12 text-[8.5px] font-mono text-white/55 hover:text-[#FFD28A] hover:border-[#E59A38]/50 flex items-center gap-1"
              title="Generate a fresh 8-step 960 analog sequence"
            >
              <Dices size={10} />
              Dice Seq
            </button>

            <span className="flex-1" />

            {/* Latch / Hold & Octave Shift */}
            <button
              onClick={() => {
                if (latchMode) {
                  setLatchMode(false);
                  setHeldNotes([]);
                } else {
                  setLatchMode(true);
                }
              }}
              className="h-6 px-2 rounded text-[9.5px] font-mono uppercase border"
              style={latchMode
                ? { borderColor: '#5CC9A7', background: 'rgba(92,201,167,0.18)', color: '#5CC9A7' }
                : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
              title="Latch keys so drones, chords, and 960 sequences keep playing hands-free"
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

          {/* 8-Stage Interactive 960 Step LEDs (Click any step to transpose its semitone interval) */}
          {patch.arp.enabled && (
            <div className="grid grid-cols-8 gap-1.5">
              {(patch.arp.steps || [0, 7, 12, 7, 0, 12, 7, 19]).slice(0, 8).map((st, idx) => {
                const isRunning = heldNotes.length > 0 && activeSeqStep === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => edit((p) => {
                      const cur = p.arp.steps[idx] ?? 0;
                      const nextIdx = (STEP_SEMITONE_CYCLE.indexOf(cur) + 1) % STEP_SEMITONE_CYCLE.length;
                      p.arp.steps[idx] = STEP_SEMITONE_CYCLE[nextIdx];
                    })}
                    className="rounded border px-1.5 py-1 flex items-center justify-between text-[9px] font-mono transition-colors hover:border-[#E59A38]/60"
                    style={{
                      borderColor: isRunning ? AURA_ACCENT : 'rgba(255,255,255,0.08)',
                      background: isRunning ? 'rgba(229,154,56,0.25)' : 'rgba(0,0,0,0.35)',
                      color: isRunning ? '#FFD28A' : 'rgba(255,255,255,0.55)',
                    }}
                    title={`Click to cycle Stage ${idx + 1} semitone offset`}
                  >
                    <span>S{idx + 1}</span>
                    <span className="font-bold">{st > 0 ? `+${st}` : st}st</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Left-Hand Pitch Bend & Mod Wheel Rollers + 2-Octave Vintage Ivory & Ebony Audition Keyboard */}
          <div className="flex items-stretch gap-2 pt-0.5">
            {/* Tactile Pitch Bend & Mod Wheel Rollers (synced with hardware MIDI controllers) */}
            <div className="flex items-stretch gap-1.5 pr-1 border-r border-white/10">
              {/* Pitch Bend Wheel (Spring-Return to Center) */}
              <div className="flex flex-col items-center gap-0.5 w-8">
                <div
                  className="relative w-7 h-14 rounded-md border border-white/15 bg-gradient-to-b from-[#251E18] via-[#120E0B] to-[#251E18] overflow-hidden cursor-ns-resize"
                  title="Pitch Bend Wheel (Spring-return, also responds to MIDI Pitch Bend)"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const norm = 1 - ((e.clientY - rect.top) / rect.height) * 2;
                    handlePitchBend(norm);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons !== 1) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const norm = 1 - ((e.clientY - rect.top) / rect.height) * 2;
                    handlePitchBend(norm);
                  }}
                  onPointerUp={() => handlePitchBend(0)}
                  onPointerCancel={() => handlePitchBend(0)}
                >
                  {/* Center detent line */}
                  <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/20" />
                  {/* Wheel thumb notch */}
                  <div
                    className="absolute left-0.5 right-0.5 h-2 rounded-sm bg-[#E59A38] shadow-[0_0_6px_#E59A38]"
                    style={{
                      top: `${Math.max(6, Math.min(88, 50 - pitchBendUi * 42))}%`,
                      transform: 'translateY(-50%)',
                    }}
                  />
                </div>
                <span className="text-[7.5px] font-mono uppercase text-white/40">Bend</span>
              </div>

              {/* Mod Wheel (0..100% Continuous, stays put) */}
              <div className="flex flex-col items-center gap-0.5 w-8">
                <div
                  className="relative w-7 h-14 rounded-md border border-white/15 bg-gradient-to-b from-[#251E18] via-[#120E0B] to-[#251E18] overflow-hidden cursor-ns-resize"
                  title="Modulation Wheel (Vibrato + Filter Shimmer + Cross-Mod, also responds to MIDI CC #1 & Aftertouch)"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const norm = 1 - (e.clientY - rect.top) / rect.height;
                    handleModWheel(norm);
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons !== 1) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const norm = 1 - (e.clientY - rect.top) / rect.height;
                    handleModWheel(norm);
                  }}
                >
                  {/* Active fill */}
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-[#5CC9A7]/25"
                    style={{ height: `${Math.round(modWheelUi * 100)}%` }}
                  />
                  {/* Wheel thumb notch */}
                  <div
                    className="absolute left-0.5 right-0.5 h-2 rounded-sm bg-[#5CC9A7] shadow-[0_0_6px_#5CC9A7]"
                    style={{
                      top: `${Math.max(6, Math.min(92, (1 - modWheelUi) * 86 + 6))}%`,
                      transform: 'translateY(-50%)',
                    }}
                  />
                </div>
                <span className="text-[7.5px] font-mono uppercase text-white/40">Mod</span>
              </div>
            </div>

            {/* 2-Octave Ivory & Ebony Keys */}
            <div className="flex-1 flex items-stretch h-14 gap-0.5">
              {KEYBOARD_NOTES.map((k) => {
                const midi = (baseOctave + 1) * 12 + k.semi;
                const isHeld = heldNotes.includes(midi);
                return (
                  <button
                    key={k.semi}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pointerDownKeyRef.current = true;
                      if (latchMode) {
                        setHeldNotes((prev) =>
                          prev.includes(midi) ? prev.filter((n) => n !== midi) : [...prev, midi]
                        );
                      } else {
                        setHeldNotes([midi]);
                      }
                    }}
                    onPointerEnter={() => {
                      if (pointerDownKeyRef.current && !latchMode) {
                        setHeldNotes([midi]);
                      }
                    }}
                    onPointerUp={() => {
                      if (!latchMode) setHeldNotes([]);
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
      </div>

      {editorOpen && (
        <AuraEditor track={track} onMutate={onMutate} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
};
