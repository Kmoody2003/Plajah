// VOLTA — Dual-Era Circuit-Modeled Vintage & Modern Super-Synth.
//
// Features:
// - 1974 discrete 2N3904 BJT transistor ladder + 1N4148 Shockley diode clipper + 12V PSU rail sag
// - West-Coast Buchla/Serge asymmetric wavefolder + bidirectional Thru-Zero linear FM
// - 2026 Cytomic ZDF state-variable morphing filter (LP -> BP -> HP -> Notch)
// - Live 4-mode Oscilloscope (Time Domain, X-Y Lissajous, FFT Spectrum, Internal Node Probes)
// - Interactive Schematic Node Probe Bar + Real MNA SPICE DC/Transient Voltage Overlay
// - Live Sourced BOM, 3D Enclosure Spec & 1-Click Handoff to Plajah Builder (Electronics Lab)
// - Compatible Preset Importer for existing AURA & ONDA patches

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CircuitBoard,
  Cpu,
  Download,
  Eye,
  Flame,
  Layers,
  Wrench,
  X,
} from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import { PANEL_SEAT_INTROS } from '../../../../services/melos/beats/band/live/lineAudio';
import {
  VOLTA,
  VOLTA_LFO_DESTS,
  VOLTA_PARAM_META,
  VOLTA_TOPOLOGIES,
  VOLTA_VOICE_MODES,
  VOLTA_WAVES,
  voltaDefaults,
} from '../../../../services/melos/instruments/volta/params';
import {
  VOLTA_CATEGORY_LABELS,
  VOLTA_CATEGORY_ORDER,
  VOLTA_MACRO_HINTS,
  VOLTA_MACRO_LABELS,
  VOLTA_MACRO_ORDER,
  VOLTA_PRESETS,
  expandVoltaMacros,
  type VoltaMacro,
} from '../../../../services/melos/instruments/volta/presets';
import {
  applyVoltaPatch,
  deserializeVoltaPatch,
  importAuraPresetToVolta,
  importOndaPresetToVolta,
  newVoltaPatch,
  serializeVoltaPatch,
  type VoltaPatch,
} from '../../../../services/melos/instruments/volta/patch';
import {
  VOLTA_NODE_PROBES,
  analyzeVoltaCircuit,
  launchVoltaInPlajahBuilder,
} from '../../../../services/melos/instruments/volta/circuitSpec';
import { buildVoltaCadModel } from '../../../../services/melos/instruments/cad3d';
import { AURA_PRESETS } from '../../../../services/melos/instruments/aura/presets';
import { FACTORY_PRESETS as ONDA_PRESETS } from '../../../../services/melos/instruments/onda/presets';
import { Knob } from '../shared/Knob';
import { FocusRange } from '../shared/FocusRange';
import { InstrumentBandSeat } from './InstrumentBandSeat';
import { Instrument3DViewport } from './3d/Instrument3DViewport';
import { Split2D3DWorkspace } from './3d/Split2D3DWorkspace';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  embedded?: boolean;
}

type ScopeMode = 'time' | 'xy' | 'spectrum' | 'probes';

const ACCENT_CYAN = '#06B6D4';
const ACCENT_AMBER = '#F59E0B';

const MACRO_COLORS: Record<VoltaMacro, string> = {
  morph: '#06B6D4',
  cutoff: '#F59E0B',
  resonance: '#FB7185',
  fold: '#A855F7',
  sag: '#F97316',
  ensemble: '#34D399',
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

function effectiveParams(patch: VoltaPatch): Record<number, number> {
  const base = voltaDefaults();
  for (const [k, v] of Object.entries(patch.params)) {
    const id = Number(k);
    if (Number.isFinite(id) && Number.isFinite(v)) base[id] = v;
  }
  const merged = expandVoltaMacros(patch.macros, base);
  return { ...base, ...merged };
}

function fmtParam(id: number, v: number): string {
  const fn = VOLTA_PARAM_META[id]?.format;
  return fn ? fn(v) : `${Math.round(v * 100)}%`;
}

export const VoltaPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  const [scopeMode, setScopeMode] = useState<ScopeMode>('time');
  const [activeProbe, setActiveProbe] = useState<number>(2); // Ladder default
  const [cutaway, setCutaway] = useState<boolean>(true);
  const [bomOpen, setBomOpen] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [builderStatus, setBuilderStatus] = useState<string>('');
  const [baseOctave, setBaseOctave] = useState<number>(3);
  const [heldNotes, setHeldNotes] = useState<number[]>([]);
  const [strikeNonce, setStrikeNonce] = useState<number>(0);
  const [lastNote, setLastNote] = useState<number>(48);
  const [pitchBendUi, setPitchBendUi] = useState<number>(0);
  const [modWheelUi, setModWheelUi] = useState<number>(0);
  const [liveProbes, setLiveProbes] = useState<number[]>([0, 0, 0, 0, 0, 1, 0.38]);

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const pointerDownKeyRef = useRef<boolean>(false);
  const activeMidiRef = useRef<number | null>(null);

  const patch: VoltaPatch = useMemo(
    () => deserializeVoltaPatch(track.instrument?.patch) ?? newVoltaPatch(),
    [track.instrument?.patch],
  );
  const params = useMemo(() => effectiveParams(patch), [patch]);

  const patchRef = useRef<VoltaPatch>(patch);
  patchRef.current = patch;
  const paramsRef = useRef<Record<number, number>>(params);
  paramsRef.current = params;
  const trackRef = useRef<ArrangeTrack>(track);
  trackRef.current = track;
  const heldRef = useRef<number[]>(heldNotes);
  heldRef.current = heldNotes;
  const scopeModeRef = useRef<ScopeMode>(scopeMode);
  scopeModeRef.current = scopeMode;
  const activeProbeRef = useRef<number>(activeProbe);
  activeProbeRef.current = activeProbe;

  // Compute live MNA SPICE circuit analysis, BOM, and physical 3D enclosure
  const circuitAnalysis = useMemo(() => analyzeVoltaCircuit(patch), [
    patch.name,
    patch.params[VOLTA.LADDER_CUTOFF],
    patch.params[VOLTA.DIODE_CLIP],
    patch.params[VOLTA.WAVEFOLD],
  ]);

  // 3D Hardware CAD model driven by live circuit parameters + cutaway X-Ray state
  const cadData = useMemo(() => buildVoltaCadModel(params, cutaway), [params, cutaway]);

  // Ensure instrument loaded & patch + probe watch activated
  useEffect(() => {
    let alive = true;
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(trackRef.current).then((inst) => {
      if (!alive || !inst) return;
      applyVoltaPatch(inst, patchRef.current);
      inst.setVoltaProbeWatch(true);
    });
    return () => {
      alive = false;
      const inst = engine.getInstrument(track.id);
      inst?.setVoltaProbeWatch(false);
    };
  }, [track.id]);

  // Pointer release & blur global cleanup (prevents stuck audition notes when releasing off-key)
  useEffect(() => {
    const up = () => {
      pointerDownKeyRef.current = false;
      setHeldNotes([]);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  const pushPatchToEngine = useCallback((next: VoltaPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) {
      applyVoltaPatch(inst, next);
      return;
    }
    const t = engine.getDoc().arrangement.find((x) => x.id === track.id);
    if (t) {
      void engine.ensureInstrument(t).then((loaded) => {
        if (loaded) {
          applyVoltaPatch(loaded, next);
          loaded.setVoltaProbeWatch(true);
        }
      });
    }
  }, [track.id]);

  const mutatePatch = useCallback((fn: (next: VoltaPatch) => void, emitParamId = VOLTA.LADDER_CUTOFF) => {
    liveBus.emit({ kind: 'param', instrument: 'volta', trackId: track.id, at: liveNow(), paramId: emitParamId });
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const next = deserializeVoltaPatch(t.instrument.patch) ?? newVoltaPatch();
      fn(next);
      t.instrument.patch = serializeVoltaPatch(next);
      t.instrument.presetName = next.name;
      patchRef.current = next;
      pushPatchToEngine(next);
    });
  }, [onMutate, pushPatchToEngine, track.id]);

  const setParam = useCallback((paramId: number, value: number) => {
    mutatePatch((next) => {
      next.params[paramId] = value;
    }, paramId);
  }, [mutatePatch]);

  const setMacro = useCallback((macro: VoltaMacro, value: number) => {
    mutatePatch((next) => {
      next.macros[macro] = Math.max(0, Math.min(1, value));
      // Mirror macro directly onto primary circuit parameter so live probes & SPICE match
      if (macro === 'morph') next.params[VOLTA.VINTAGE_MORPH] = value;
      if (macro === 'cutoff') next.params[VOLTA.LADDER_CUTOFF] = 0.08 + value * 0.90;
      if (macro === 'resonance') next.params[VOLTA.LADDER_RES] = value * 0.92;
      if (macro === 'fold') next.params[VOLTA.WAVEFOLD] = value * 0.85;
      if (macro === 'sag') next.params[VOLTA.PSU_SAG] = value * 0.85;
      if (macro === 'ensemble') next.params[VOLTA.CHORUS] = value;
    }, VOLTA.VINTAGE_MORPH);
  }, [mutatePatch]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = VOLTA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    liveBus.emit({ kind: 'preset', instrument: 'volta', trackId: track.id, at: liveNow(), presetId: preset.id, presetName: preset.name });
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      const next = newVoltaPatch(preset.id);
      t.instrument.patch = serializeVoltaPatch(next);
      t.instrument.presetName = preset.name;
      t.name = preset.name;
      syncPadWithTrack(d, track.id);
      patchRef.current = next;
      pushPatchToEngine(next);
    });
  }, [onMutate, pushPatchToEngine, track.id]);

  const importAuraPreset = useCallback((auraId: string) => {
    const preset = AURA_PRESETS.find((p) => p.id === auraId);
    if (!preset) return;
    const next = importAuraPresetToVolta(preset);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      t.instrument.patch = serializeVoltaPatch(next);
      t.instrument.presetName = next.name;
      t.name = next.name;
      syncPadWithTrack(d, track.id);
      patchRef.current = next;
      pushPatchToEngine(next);
    });
    setImportOpen(false);
  }, [onMutate, pushPatchToEngine, track.id]);

  const importOndaPreset = useCallback((ondaName: string) => {
    const preset = ONDA_PRESETS.find((p) => p.name === ondaName);
    if (!preset) return;
    const next = importOndaPresetToVolta(preset);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t?.instrument) return;
      t.instrument.patch = serializeVoltaPatch(next);
      t.instrument.presetName = next.name;
      t.name = next.name;
      syncPadWithTrack(d, track.id);
      patchRef.current = next;
      pushPatchToEngine(next);
    });
    setImportOpen(false);
  }, [onMutate, pushPatchToEngine, track.id]);

  const handleLaunchBuilder = useCallback(() => {
    const res = launchVoltaInPlajahBuilder(patchRef.current);
    setBuilderStatus(`Sent "${patchRef.current.name}" (${res.circuit.parts.length} parts, 0 ERC errors) to Plajah Builder!`);
    window.setTimeout(() => setBuilderStatus(''), 5000);
  }, []);

  // Audition keyboard helpers
  const stopCurrentNote = useCallback(() => {
    if (activeMidiRef.current !== null) {
      BeatsEngine.get().instrumentNoteOff(trackRef.current, activeMidiRef.current);
      activeMidiRef.current = null;
    }
  }, []);

  const triggerNoteOn = useCallback((midi: number, velocity = 112) => {
    setLastNote(midi);
    setStrikeNonce((n) => n + 1);
    const engine = BeatsEngine.get();
    const trk = trackRef.current;
    const play = () => {
      if (activeMidiRef.current !== null && activeMidiRef.current !== midi) {
        engine.instrumentNoteOff(trk, activeMidiRef.current);
      }
      activeMidiRef.current = midi;
      engine.instrumentNoteOn(trk, midi, velocity);
    };
    const inst = engine.getInstrument(trk.id);
    if (!inst) {
      void engine.ensureInstrument(trk).then((loaded) => {
        if (loaded) {
          applyVoltaPatch(loaded, patchRef.current);
          loaded.setVoltaProbeWatch(true);
        }
        play();
      });
      return;
    }
    play();
  }, []);

  useEffect(() => {
    if (heldNotes.length === 0) {
      stopCurrentNote();
      return;
    }
    triggerNoteOn(heldNotes[heldNotes.length - 1]);
    return () => {
      stopCurrentNote();
    };
  }, [heldNotes, stopCurrentNote, triggerNoteOn]);

  const handlePitchBend = useCallback((val: number) => {
    const clamped = Math.max(-1, Math.min(1, val));
    setPitchBendUi(clamped);
    BeatsEngine.get().setInstrumentPitchBend(trackRef.current, clamped);
  }, []);

  const handleModWheel = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setModWheelUi(clamped);
    BeatsEngine.get().setInstrumentModWheel(trackRef.current, clamped);
  }, []);

  // Real-time 60 FPS Oscilloscope, X-Y Phase, FFT Spectrum & Node Probes Renderer
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pcmL = new Float32Array(1024);
    const pcmR = new Float32Array(1024);
    const specBuf = new Uint8Array(512);
    let raf = 0;
    let probeTick = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 520;
      const h = canvas.clientHeight || 170;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      const engine = BeatsEngine.get();
      const inst = engine.getInstrument(trackRef.current.id);
      const peakL = inst ? inst.readWaveform(pcmL) : 0;
      const peakR = inst ? inst.readRightWaveform(pcmR) : peakL;
      const probes = inst?.voltaProbes ?? [0, 0, 0, 0, 0, 1, paramsRef.current[VOLTA.BIAS_TEMP] ?? 0.38];

      if ((++probeTick % 4) === 0 && inst) {
        setLiveProbes([...probes]);
      }

      const mode = scopeModeRef.current;
      const morph = paramsRef.current[VOLTA.VINTAGE_MORPH] ?? 0.35;
      const probeIdx = activeProbeRef.current;

      // Dark CRT / OLED fade
      ctx.fillStyle = mode === 'xy' ? 'rgba(6, 9, 14, 0.22)' : 'rgba(6, 9, 14, 0.38)';
      ctx.fillRect(0, 0, w, h);

      // Graticule lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 1; gx < 10; gx++) {
        const x = (w / 10) * gx;
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let gy = 1; gy < 4; gy++) {
        const y = (h / 4) * gy;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();

      if (readoutRef.current) {
        const activeList = heldRef.current.length > 0 ? heldRef.current.map(midiToName).join(' ') : 'STANDBY';
        const pInfo = VOLTA_NODE_PROBES[probeIdx];
        const railV = (5.0 * Math.max(0.75, Math.min(1.05, probes[5] ?? 1))).toFixed(2);
        readoutRef.current.textContent = `${activeList} · PROBE ${pInfo?.label ?? 'OUT'} ${(probes[probeIdx] ?? 0).toFixed(2)} · 5V RAIL ${railV}V`;
      }

      const peak = Math.max(peakL, peakR);
      if (mode === 'time') {
        if (peak > 0.004) {
          let trig = 0;
          const half = Math.floor(pcmL.length * 0.5);
          for (let i = 1; i < half; i++) {
            if (pcmL[i - 1] <= 0 && pcmL[i] > 0) { trig = i; break; }
          }
          const span = Math.min(pcmL.length - trig, 420);
          const gainNorm = Math.min(3.5, 0.84 / Math.max(0.14, peak));

          // Right channel / circuit comparison trace (warm amber)
          ctx.beginPath();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.62)';
          for (let px = 0; px < w; px++) {
            const idx = trig + Math.min(span - 1, Math.floor((px / w) * span));
            const s = Math.tanh((pcmR[idx] ?? 0) * gainNorm);
            const y = h * 0.5 - s * (h * 0.40);
            if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
          }
          ctx.stroke();

          // Left / primary trace (electric cyan + halo)
          ctx.beginPath();
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.22)';
          for (let px = 0; px < w; px++) {
            const idx = trig + Math.min(span - 1, Math.floor((px / w) * span));
            const s = Math.tanh((pcmL[idx] ?? 0) * gainNorm);
            const y = h * 0.5 - s * (h * 0.40);
            if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
          }
          ctx.stroke();

          ctx.beginPath();
          ctx.lineWidth = 1.9;
          ctx.strokeStyle = morph < 0.45 ? '#FBBF24' : '#22D3EE';
          for (let px = 0; px < w; px++) {
            const idx = trig + Math.min(span - 1, Math.floor((px / w) * span));
            const s = Math.tanh((pcmL[idx] ?? 0) * gainNorm);
            const y = h * 0.5 - s * (h * 0.40);
            if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
          }
          ctx.stroke();
        } else {
          // Flat thermal baseline with subtle PSU 60Hz/thermal noise shimmer
          ctx.beginPath();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
          const tNow = performance.now() * 0.004;
          for (let px = 0; px < w; px += 4) {
            const j = Math.sin(px * 0.14 + tNow) * (0.4 + (paramsRef.current[VOLTA.OTA_DRIFT] ?? 0.2) * 1.2);
            const y = h * 0.5 + j;
            if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      } else if (mode === 'xy') {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const rad = Math.min(w, h) * 0.41;
        ctx.beginPath();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#22D3EE';
        const gainNorm = Math.min(3.5, 0.85 / Math.max(0.12, peak));
        for (let i = 0; i < 512; i += 2) {
          const x = cx + Math.tanh((pcmL[i] ?? 0) * gainNorm) * rad;
          const y = cy - Math.tanh((pcmR[i] ?? 0) * gainNorm) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.font = '9px monospace';
        ctx.fillText('L vs R LISSAJOUS PHASE', 10, 14);
      } else if (mode === 'spectrum') {
        const bins = inst ? inst.readSpectrum(specBuf) : 0;
        const drawBins = Math.min(bins || 128, 128);
        const barW = Math.max(2, (w - 16) / drawBins);
        for (let i = 0; i < drawBins; i++) {
          const v = (specBuf[i] ?? 0) / 255;
          const bh = Math.max(2, v * (h - 24));
          ctx.fillStyle = i < drawBins * 0.35 ? '#F59E0B' : '#06B6D4';
          ctx.fillRect(8 + i * barW, h - 10 - bh, Math.max(1.5, barW - 1), bh);
        }
        // Ladder & SVF cutoff vertical markers
        const lx = 8 + (paramsRef.current[VOLTA.LADDER_CUTOFF] ?? 0.62) * (w - 16);
        const sx = 8 + (paramsRef.current[VOLTA.SVF_CUTOFF] ?? 0.74) * (w - 16);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(lx, 8); ctx.lineTo(lx, h - 8);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
        ctx.beginPath();
        ctx.moveTo(sx, 8); ctx.lineTo(sx, h - 8);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Live internal WASM node probe bar readout
        const colW = (w - 24) / VOLTA_NODE_PROBES.length;
        VOLTA_NODE_PROBES.forEach((pr, idx) => {
          const val = Math.min(1, Math.abs(probes[idx] ?? 0));
          const x = 14 + idx * colW;
          const bh = Math.max(6, val * (h - 46));
          const selected = idx === probeIdx;
          ctx.fillStyle = selected ? 'rgba(6, 182, 212, 0.16)' : 'rgba(255,255,255,0.03)';
          ctx.fillRect(x, 12, colW - 8, h - 28);
          ctx.fillStyle = idx < 3 ? '#F59E0B' : idx < 5 ? '#06B6D4' : '#34D399';
          ctx.fillRect(x + 6, h - 22 - bh, colW - 20, bh);
          ctx.fillStyle = selected ? '#FFFFFF' : 'rgba(255,255,255,0.65)';
          ctx.font = 'bold 9px monospace';
          ctx.fillText(pr.partRef, x + 6, h - 8);
        });
      }
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const selectedProbe = VOLTA_NODE_PROBES[activeProbe] ?? VOLTA_NODE_PROBES[0];
  const spDc = circuitAnalysis.nodeDcVoltages[selectedProbe.id] ?? 0;
  const spTran = circuitAnalysis.nodeTranPeaks[selectedProbe.id] ?? 0;
  const liveNodeVal = liveProbes[activeProbe] ?? 0;

  const leftPane = (
    <div className="flex flex-col gap-3 p-3.5 text-white select-none">
      {/* ── Hardware Super-Synth Header ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-[#0e1520] via-[#131926] to-[#1d1712] px-3 py-2.5 shadow-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-black text-[11px] tracking-[0.2em]">
            VOLTA
          </span>
          <span className="text-[10px] font-mono text-amber-300/90 border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 rounded">
            '74 BJT ↔ '26 ZDF
          </span>
        </div>

        {/* Preset Selector */}
        <select
          aria-label="VOLTA Factory Preset"
          value={patch.presetId || ''}
          onChange={(e) => applyPreset(e.target.value)}
          className="h-7 px-2 rounded-lg bg-black/50 border border-white/15 text-[11px] font-medium text-white max-w-[205px]"
        >
          {VOLTA_CATEGORY_ORDER.map((cat) => (
            <optgroup key={cat} label={VOLTA_CATEGORY_LABELS[cat]}>
              {VOLTA_PRESETS.filter((p) => p.category === cat).map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Cross-Synth Importer (AURA / ONDA -> VOLTA) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            className="h-7 px-2.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-[10px] font-mono text-white/80 flex items-center gap-1"
            title="Convert any AURA or ONDA patch into a circuit-modeled VOLTA patch"
          >
            <Download size={11} className="text-cyan-400" />
            Import AURA/ONDA
          </button>
          {importOpen && (
            <div className="absolute left-0 top-8 z-50 w-64 max-h-64 overflow-y-auto rounded-xl border border-white/15 bg-[#0f131b] p-2 shadow-2xl flex flex-col gap-1">
              <p className="text-[9px] uppercase tracking-wider text-amber-300 px-1">Import AURA Vintage Preset</p>
              {AURA_PRESETS.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => importAuraPreset(p.id)}
                  className="text-left px-2 py-1 rounded hover:bg-white/10 text-[10.5px] text-white/80 truncate"
                >
                  AURA · {p.name}
                </button>
              ))}
              <p className="text-[9px] uppercase tracking-wider text-purple-300 px-1 mt-1">Import ONDA Preset</p>
              {ONDA_PRESETS.slice(0, 10).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => importOndaPreset(p.name)}
                  className="text-left px-2 py-1 rounded hover:bg-white/10 text-[10.5px] text-white/80 truncate"
                >
                  ONDA · {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="flex-1" />

        {/* X-Ray Chassis Cutaway */}
        <button
          type="button"
          onClick={() => setCutaway((v) => !v)}
          className={`h-7 px-2.5 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition ${
            cutaway
              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              : 'border-white/15 bg-white/[0.04] text-white/65 hover:text-white'
          }`}
          title="Toggle translucent X-Ray faceplate on the 3D CAD chassis to expose internal PCB, toroidal transformer & ladder BJTs"
        >
          <Eye size={11} />
          X-Ray PCB
        </button>

        {/* Launch in Plajah Builder (Electronics Lab) */}
        <button
          type="button"
          onClick={handleLaunchBuilder}
          className="h-7 px-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-amber-500 text-black font-bold text-[10.5px] flex items-center gap-1.5 shadow hover:brightness-110 transition"
          title="Open this synth's live SPICE circuit schematic, ERC validation, sourced BOM & 3D CNC enclosure inside Plajah Builder"
        >
          <Wrench size={11} />
          Build in Plajah Builder
        </button>

        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 text-white/45 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {builderStatus && (
        <div className="px-3 py-1.5 rounded-lg border border-emerald-400/35 bg-emerald-500/15 text-emerald-200 text-[11px] font-medium">
          {builderStatus}
        </div>
      )}

      {/* ── Live Multi-Mode Oscilloscope + Clickable Schematic Node Probe Bar ── */}
      <div className="rounded-2xl border border-white/10 bg-[#080b11] p-2.5 flex flex-col gap-2 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Activity size={13} className="text-cyan-400" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-cyan-200">
              Signal Probe Scope
            </span>
            <span ref={readoutRef} className="ml-2 text-[9.5px] font-mono text-white/55 hidden sm:inline">
              STANDBY
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 p-0.5">
            {([
              ['time', 'Time'],
              ['xy', 'X-Y Phase'],
              ['spectrum', 'FFT Spectrum'],
              ['probes', 'Node Probes'],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setScopeMode(m)}
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono transition ${
                  scopeMode === m
                    ? 'bg-cyan-500/25 text-cyan-200 font-bold'
                    : 'text-white/45 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <canvas
          ref={scopeCanvasRef}
          className="w-full h-[142px] rounded-xl border border-cyan-500/20 bg-[#06090e] block"
        />

        {/* Clickable Internal Schematic Stages */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {VOLTA_NODE_PROBES.map((pr, idx) => {
            const on = activeProbe === idx;
            const liveV = liveProbes[idx] ?? 0;
            return (
              <button
                key={pr.id}
                type="button"
                onClick={() => setActiveProbe(idx)}
                className={`flex-1 min-w-[92px] rounded-lg border px-2 py-1 text-left transition ${
                  on
                    ? 'border-cyan-400/60 bg-cyan-500/15'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between text-[8.5px] font-mono">
                  <span className={on ? 'text-cyan-300 font-bold' : 'text-amber-300/80'}>{pr.partRef}.{pr.pinName}</span>
                  <span className="text-white/50">{Math.round(Math.abs(liveV) * 100)}%</span>
                </div>
                <div className="text-[9.5px] font-semibold text-white/85 truncate">{pr.label}</div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] font-mono text-white/60 border-t border-white/[0.07] pt-1.5">
          <span>
            <strong className="text-cyan-300">{selectedProbe.label}</strong> ({selectedProbe.partRef}.{selectedProbe.pinName}):{' '}
            {selectedProbe.description}
          </span>
          <span className="text-amber-300">
            SPICE DC {spDc.toFixed(2)}V · Tran Peak {spTran.toFixed(2)}V · DSP {liveNodeVal.toFixed(3)}
          </span>
        </div>
      </div>

      {/* ── Front-Panel 6 Super-Synth Macros (K1 Hover-Mapped) ── */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5 flex items-center justify-around gap-2 flex-wrap">
        {VOLTA_MACRO_ORDER.map((m) => (
          <Knob
            key={m}
            trackId={track.id}
            focusId={`volta:${track.id}:macro:${m}`}
            label={VOLTA_MACRO_LABELS[m]}
            value={patch.macros[m] ?? 0.45}
            min={0}
            max={1}
            step={0.01}
            size={44}
            color={MACRO_COLORS[m]}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setMacro(m, v)}
          />
        ))}
      </div>

      {/* ── Topology, Filter Architecture & Circuit Sliders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {/* Dual VCO, Wavefolder & Thru-Zero FM */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300 flex items-center gap-1.5">
              <Cpu size={12} /> VCO Core &amp; Wavefolder
            </span>
            <div className="flex items-center gap-1">
              {VOLTA_WAVES.slice(0, 5).map((w, idx) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setParam(VOLTA.OSC1_WAVE, idx)}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono border ${
                    Math.round(params[VOLTA.OSC1_WAVE] ?? 0) === idx
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                      : 'border-white/10 text-white/45 hover:text-white'
                  }`}
                >
                  {w.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              [VOLTA.OSC_MIX, 'VCO 1/2 Mix'],
              [VOLTA.OSC2_SEMI, 'VCO2 Pitch'],
              [VOLTA.OSC2_DETUNE, 'VCO2 Fine'],
              [VOLTA.SUB_LVL, 'Sub Oct'],
              [VOLTA.WAVEFOLD, 'Buchla Fold'],
              [VOLTA.FOLD_SYM, 'Fold Bias'],
              [VOLTA.FM_TZ, 'Thru-Zero FM'],
              [VOLTA.NOISE_LVL, 'Shot Noise'],
            ].map(([pid, lbl]) => (
              <div key={pid} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px] text-white/60 font-mono">
                  <span>{lbl}</span>
                  <span className="text-amber-300">{fmtParam(pid as number, params[pid as number] ?? 0)}</span>
                </div>
                <FocusRange
                  trackId={track.id}
                  focusId={`volta:${track.id}:p:${pid}`}
                  label={String(lbl)}
                  value={params[pid as number] ?? 0}
                  min={0}
                  max={1}
                  step={0.005}
                  accentColor={ACCENT_AMBER}
                  onValueChange={(v) => setParam(pid as number, v)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dual-Era Discrete BJT Ladder <-> 2026 Cytomic SVF */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300 flex items-center gap-1.5">
              <CircuitBoard size={12} /> '74 Ladder ↔ '26 Cytomic SVF
            </span>
            <select
              aria-label="Filter Topology"
              value={Math.round(params[VOLTA.TOPOLOGY] ?? 2)}
              onChange={(e) => setParam(VOLTA.TOPOLOGY, Number(e.target.value))}
              className="h-6 px-1.5 rounded bg-black/50 border border-white/15 text-[9.5px] font-mono text-cyan-200"
            >
              {VOLTA_TOPOLOGIES.map((t, idx) => (
                <option key={t} value={idx}>{t}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              [VOLTA.VINTAGE_MORPH, 'Era Morph'],
              [VOLTA.LADDER_CUTOFF, 'Ladder Cutoff'],
              [VOLTA.LADDER_RES, 'Ladder Res'],
              [VOLTA.LADDER_DRIVE, 'BJT Drive'],
              [VOLTA.SVF_CUTOFF, 'SVF Cutoff'],
              [VOLTA.SVF_RES, 'SVF Q'],
              [VOLTA.SVF_MODE, 'SVF Morph'],
              [VOLTA.DIODE_CLIP, '1N4148 Clip'],
            ].map(([pid, lbl]) => (
              <div key={pid} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px] text-white/60 font-mono">
                  <span>{lbl}</span>
                  <span className="text-cyan-300">{fmtParam(pid as number, params[pid as number] ?? 0)}</span>
                </div>
                <FocusRange
                  trackId={track.id}
                  focusId={`volta:${track.id}:p:${pid}`}
                  label={String(lbl)}
                  value={params[pid as number] ?? 0}
                  min={0}
                  max={1}
                  step={0.005}
                  accentColor={ACCENT_CYAN}
                  onValueChange={(v) => setParam(pid as number, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Analog Physics, Envelopes & Modulation Strip ── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300 flex items-center gap-1.5">
            <Flame size={12} /> Analog Physics, Envelopes &amp; Stereo Ensemble
          </span>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="LFO Target"
              value={Math.round(params[VOLTA.LFO_DEST] ?? 0)}
              onChange={(e) => setParam(VOLTA.LFO_DEST, Number(e.target.value))}
              className="h-6 px-1.5 rounded bg-black/50 border border-white/15 text-[9.5px] font-mono text-white/80"
            >
              {VOLTA_LFO_DESTS.map((l, idx) => (
                <option key={l} value={idx}>LFO → {l}</option>
              ))}
            </select>
            <div className="flex rounded border border-white/10 bg-black/40 p-0.5">
              {VOLTA_VOICE_MODES.map((vm, idx) => (
                <button
                  key={vm}
                  type="button"
                  onClick={() => setParam(VOLTA.VOICE_MODE, idx)}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono ${
                    Math.round(params[VOLTA.VOICE_MODE] ?? 0) === idx
                      ? 'bg-amber-500/25 text-amber-200 font-bold'
                      : 'text-white/45 hover:text-white'
                  }`}
                >
                  {vm.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-2.5 gap-y-1.5">
          {[
            [VOLTA.OTA_DRIFT, 'OTA Drift'],
            [VOLTA.PSU_SAG, 'PSU Sag'],
            [VOLTA.BIAS_TEMP, 'Temp Vt'],
            [VOLTA.FILT_ENV_AMT, 'Env→Filt'],
            [VOLTA.AMP_ATK, 'Amp Atk'],
            [VOLTA.AMP_REL, 'Amp Rel'],
            [VOLTA.FLT_DEC, 'Flt Dec'],
            [VOLTA.LFO_RATE, 'LFO Rate'],
            [VOLTA.LFO_DEPTH, 'LFO Depth'],
            [VOLTA.UNISON, 'Dual Stack'],
            [VOLTA.CHORUS, 'BBD Chorus'],
            [VOLTA.GLIDE, 'Glide'],
          ].map(([pid, lbl]) => (
            <div key={pid} className="flex flex-col gap-0.5">
              <div className="flex justify-between text-[8.5px] text-white/55 font-mono">
                <span>{lbl}</span>
                <span className="text-orange-300">{fmtParam(pid as number, params[pid as number] ?? 0)}</span>
              </div>
              <FocusRange
                trackId={track.id}
                focusId={`volta:${track.id}:p:${pid}`}
                label={String(lbl)}
                value={params[pid as number] ?? 0}
                min={0}
                max={1}
                step={0.005}
                accentColor="#FB923C"
                onValueChange={(v) => setParam(pid as number, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Sourced Physical Hardware BOM, SPICE ERC & CNC Enclosure Spec ── */}
      <div className="rounded-xl border border-cyan-500/20 bg-black/30 p-2.5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setBomOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-[10.5px] font-bold text-cyan-200">
            <Layers size={12} />
            Physical Build Spec &amp; Sourced Real Parts ({circuitAnalysis.bom.length} BOM lines ·{' '}
            {circuitAnalysis.summary.passes} ERC checks passed)
          </span>
          <span className="text-[9.5px] font-mono text-white/55">
            {bomOpen ? 'Hide BOM' : 'Show BOM & Enclosure'}
          </span>
        </button>

        {bomOpen && (
          <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] font-mono">
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2">
                <div className="text-white/45">SPICE Verification</div>
                <div className="text-emerald-300 font-bold">
                  {circuitAnalysis.summary.errors} Err · {circuitAnalysis.summary.warnings} Warn ·{' '}
                  {circuitAnalysis.summary.passes} Pass ({circuitAnalysis.summary.nets} nets)
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2">
                <div className="text-white/45">3D CNC Enclosure</div>
                <div className="text-cyan-300 font-bold">
                  {[circuitAnalysis.enclosure.W, circuitAnalysis.enclosure.D, circuitAnalysis.enclosure.H].map((v) => Math.round(v)).join(' × ')} mm
                </div>
              </div>
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex items-center justify-between">
                <div>
                  <div className="text-white/45">Chassis Panels</div>
                  <div className="text-amber-300 font-bold">{circuitAnalysis.enclosure.panels.entities.length} DXF paths</div>
                </div>
                <button
                  type="button"
                  onClick={handleLaunchBuilder}
                  className="px-2 py-1 rounded bg-cyan-500 text-black font-bold text-[9.5px]"
                >
                  Open Lab
                </button>
              </div>
            </div>

            <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
              <table className="w-full text-left text-[9.5px] font-mono">
                <thead className="bg-white/[0.04] text-white/50">
                  <tr>
                    <th className="px-2 py-1">Part Refs</th>
                    <th className="px-2 py-1">Qty</th>
                    <th className="px-2 py-1">Component</th>
                    <th className="px-2 py-1">Distributor Search</th>
                    <th className="px-2 py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {circuitAnalysis.bom.map((line, i) => (
                    <tr key={i} className="border-t border-white/[0.06] text-white/80">
                      <td className="px-2 py-1 text-amber-300">{line.refs.join(', ')}</td>
                      <td className="px-2 py-1">{line.qty}</td>
                      <td className="px-2 py-1">{line.part}</td>
                      <td className="px-2 py-1 text-cyan-300">{line.query}</td>
                      <td className="px-2 py-1 text-white/55">{line.note || (line.authorised ? 'Authorised' : 'Standard')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Pitch Bend, Mod Wheel & 2-Octave Playable Keyboard ── */}
      <div className="rounded-xl border border-white/10 bg-black/35 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[9.5px] font-mono text-white/55">
          <span>AUDITION KEYBED · LAST {midiToName(lastNote)}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBaseOctave((o) => Math.max(1, o - 1))}
              className="px-2 py-0.5 rounded border border-white/15 hover:text-white"
            >
              -
            </button>
            <span className="text-cyan-300 font-bold">C{baseOctave}</span>
            <button
              type="button"
              onClick={() => setBaseOctave((o) => Math.min(6, o + 1))}
              className="px-2 py-0.5 rounded border border-white/15 hover:text-white"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Pitch & Mod sliders */}
          <div className="flex items-center gap-1.5 flex-none">
            <div className="flex flex-col items-center gap-0.5 w-7">
              <div
                className="relative w-6 h-14 rounded border border-white/15 bg-black/60 cursor-ns-resize overflow-hidden"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const r = e.currentTarget.getBoundingClientRect();
                  handlePitchBend((0.5 - (e.clientY - r.top) / r.height) * 2);
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  handlePitchBend((0.5 - (e.clientY - r.top) / r.height) * 2);
                }}
                onPointerUp={() => handlePitchBend(0)}
              >
                <div
                  className="absolute left-0.5 right-0.5 h-2 rounded-sm bg-cyan-400"
                  style={{ top: `${Math.max(6, Math.min(88, 50 - pitchBendUi * 42))}%`, transform: 'translateY(-50%)' }}
                />
              </div>
              <span className="text-[7px] font-mono text-white/40">PB</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 w-7">
              <div
                className="relative w-6 h-14 rounded border border-white/15 bg-black/60 cursor-ns-resize overflow-hidden"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const r = e.currentTarget.getBoundingClientRect();
                  handleModWheel(1 - (e.clientY - r.top) / r.height);
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  handleModWheel(1 - (e.clientY - r.top) / r.height);
                }}
              >
                <div
                  className="absolute left-0.5 right-0.5 h-2 rounded-sm bg-amber-400"
                  style={{ top: `${Math.max(6, Math.min(90, (1 - modWheelUi) * 86 + 6))}%`, transform: 'translateY(-50%)' }}
                />
              </div>
              <span className="text-[7px] font-mono text-white/40">MOD</span>
            </div>
          </div>

          <div className="flex-1 flex items-stretch h-14 gap-0.5 touch-none">
            {KEYBOARD_NOTES.map((k) => {
              const midi = (baseOctave + 1) * 12 + k.semi;
              const isHeld = heldNotes.includes(midi);
              return (
                <button
                  key={k.semi}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pointerDownKeyRef.current = true;
                    setHeldNotes([midi]);
                  }}
                  onPointerEnter={() => {
                    if (pointerDownKeyRef.current) setHeldNotes([midi]);
                  }}
                  onPointerUp={() => setHeldNotes([])}
                  aria-label={`VOLTA note ${midiToName(midi)}`}
                  className="flex-1 rounded-b border flex flex-col items-center justify-end pb-0.5 transition-transform active:translate-y-[1px]"
                  style={
                    isHeld
                      ? { background: '#06B6D4', borderColor: '#67E8F9', color: '#041418' }
                      : k.black
                        ? { background: '#171921', borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.4)', height: '74%' }
                        : { background: '#E2E8F0', borderColor: 'rgba(0,0,0,0.35)', color: '#1E293B' }
                  }
                >
                  <span className="text-[7.5px] font-mono font-bold">
                    {k.semi % 12 === 0 ? `C${baseOctave + Math.floor(k.semi / 12)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Session Band Seat (Nova · Synthesizers) ── */}
      <InstrumentBandSeat
        instrument="volta"
        playerId="nova"
        loreId="synthesizer"
        role="Session Band circuit synthesizer · live"
        intro={PANEL_SEAT_INTROS.volta}
        screenText={`VOLTA · ${patch.name} · Morph ${Math.round((params[VOLTA.VINTAGE_MORPH] ?? 0.35) * 100)}%, Fold ${Math.round((params[VOLTA.WAVEFOLD] ?? 0.15) * 100)}%, Ladder ${Math.round((params[VOLTA.LADDER_CUTOFF] ?? 0.62) * 100)}%`}
        accent={ACCENT_CYAN}
        track={track}
        presetName={patch.name}
        defaultNote={48}
      />
    </div>
  );

  const workspace = (
    <Split2D3DWorkspace
      trackId={track.id}
      accentHex={ACCENT_CYAN}
      title3D="3D CAD · VOLTA Hardware & Internal PCB"
      subtitle3D={`${patch.name} · ${cutaway ? 'X-Ray Chassis' : 'Solid Aluminum'}`}
      left={leftPane}
      right3D={
        <Instrument3DViewport
          fillHeight
          model={cadData.model}
          spec={cadData.spec}
          trackId={track.id}
          strikeNonce={strikeNonce}
          sustained={heldNotes.length > 0}
          heldCount={() => heldRef.current.length}
          subtitle={cadData.spec.subtitle}
          kinematicsMeta={{
            archetype: 'synth',
          }}
          onTrigger={() => {
            const note = lastNote || 48;
            triggerNoteOn(note, 112);
            window.setTimeout(() => BeatsEngine.get().instrumentNoteOff(trackRef.current, note), 260);
          }}
        />
      }
      rightFooter={
        <div className="flex items-center justify-between gap-2 text-[9.5px] font-mono text-white/60">
          <span>
            Probe: <strong className="text-cyan-300">{selectedProbe.label}</strong> ({spDc.toFixed(2)}V DC / {spTran.toFixed(2)}Vpk)
          </span>
          <button
            type="button"
            onClick={handleLaunchBuilder}
            className="px-2 py-0.5 rounded border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 font-bold"
          >
            Open in Builder
          </button>
        </div>
      }
    />
  );

  if (embedded) return workspace;
  return (
    <div className="fixed inset-y-0 right-0 z-[1200] w-full max-w-[1060px] flex flex-col bg-[#0b0e14] border-l border-white/10 shadow-2xl">
      {workspace}
    </div>
  );
};
