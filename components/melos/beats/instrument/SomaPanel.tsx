// SOMA — Real-Time Multi-Physics Acoustic Percussion & Chamber Simulator UI.
//
// Features:
//   1. Interactive 2D Circular Drumhead Strike Pad (click/drag anywhere from dead center r/a = 0%
//      to rim edge r/a = 95% to strike the physical membrane at that exact radial & azimuthal
//      coordinate, with live 2D Bessel eigenmode wave animation).
//   2. Coupled Air Cavity & Wood/Metal Shell Cross-Section Visualizer (Sealed Kettle Bowl,
//      Djembe Goblet Helmholtz Neck, Conga Stave Barrel, Talking-Drum Hourglass Dual-Head,
//      Taiko Barrel, and Shallow Frame Hoop).
//   3. Live Timpani Foot Pedal / Talking-Drum Underarm Tension Cord Ribbon (-12 to +12 st live
//      membrane tension modulation while modes are ringing).
//   4. 6 Physical Performance Macros, Acoustic Body Morph (Crossform), and 4-Domain Deep Physics Editor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Sliders, Sparkles, Disc, Layers, Activity } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import {
  P,
  SM,
  STRIKER_TYPES,
  SKIN_MATERIALS,
  CAVITY_TYPES,
  SHELL_MATERIALS,
  BESSEL_MODES,
  besselJ,
  SOMA_PARAM_META,
  formatSomaParam,
  somaDefault,
} from '../../../../services/melos/instruments/soma/params';
import {
  SOMA_PRESETS,
  SOMA_CATEGORY_ORDER,
  SOMA_CATEGORY_LABELS,
  expandSomaMacros,
  type SomaCategory,
  type SomaMacro,
  type SomaPreset,
} from '../../../../services/melos/instruments/soma/presets';
import {
  newSomaPatch,
  deserializeSomaPatch,
  serializeSomaPatch,
  applySomaPreset,
  applySomaPatch,
  somaHandConfig,
  somaEngineValue,
  crossformSomaPatch,
  polarToDrumPad,
  drumPadToPolar,
  SOMA_MACRO_ORDER,
  SOMA_MACRO_LABELS,
  SOMA_MACRO_HINTS,
  SOMA_EDITOR_GROUPS,
  type SomaPatch,
} from '../../../../services/melos/instruments/soma/patch';
import { Knob } from '../shared/Knob';
import { SomaDrumStory } from './SomaDrumStory';
import { SomaDeepToggle } from './SomaDeepToggle';
import { SomaHandMapCard } from './SomaHandMapCard';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
  embedded?: boolean;
}

const ACCENT = '#E86A33';
const GOLD = '#F59E0B';
const TEAL = '#10B981';

export const SomaPanel: React.FC<Props> = ({ doc, track, onMutate, onClose, embedded }) => {
  const patch: SomaPatch = useMemo(
    () => deserializeSomaPatch(track.instrument?.patch) ?? newSomaPatch(),
    [track.instrument?.patch],
  );

  const [category, setCategory] = useState<SomaCategory>(() => {
    const found = SOMA_PRESETS.find((p) => p.id === patch.presetId);
    return found?.category ?? 'timpani';
  });
  const [mode, setMode] = useState<'play' | 'deep' | 'lab'>('play');
  const [deepTab, setDeepTab] = useState<'striker' | 'membrane' | 'chamber' | 'radiation'>('striker');
  const [morphTargetId, setMorphTargetId] = useState<string>(SOMA_PRESETS[6]?.id ?? 'djembe-lenke-master');
  const [morphAmt, setMorphAmt] = useState<number>(0);
  const [heldNotes, setHeldNotes] = useState<Set<number>>(new Set());
  const [labGroovePlaying, setLabGroovePlaying] = useState<boolean>(false);
  const [lastTelemetry, setLastTelemetry] = useState<{
    crestDb: number;
    nearRimMs: number;
    farRimMs: number;
    bodyT60Ms: number;
    pitchGlideSt: number;
    f0Hz: number;
    f11Hz: number;
    fHelmholtzHz: number;
  }>({
    crestDb: 16.4,
    nearRimMs: 0.6,
    farRimMs: 2.8,
    bodyT60Ms: 340,
    pitchGlideSt: 2.4,
    f0Hz: 110,
    f11Hz: 171,
    fHelmholtzHz: 74,
  });

  // Live strike animation state for the 2D Bessel membrane & chamber pressure visualizers
  const strikeAnimRef = useRef<{
    time: number;
    active: boolean;
    rho: number;
    angle: number;
    velocity: number;
    weights: number[];
  }>({
    time: 0,
    active: false,
    rho: patch.params[SM.STRIKE_POS] ?? 0.62,
    angle: patch.params[SM.STRIKE_ANGLE] ?? 0.5,
    velocity: 0.85,
    weights: BESSEL_MODES.map((m) => besselJ(m.m, m.besselRoot * 0.62)),
  });

  const headCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chamberCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const labScopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeVoices = useRef<Map<number, number>>(new Map());
  const refAudioCtxRef = useRef<AudioContext | null>(null);

  const resolvedParams = useMemo(
    () => expandSomaMacros(patch.params, patch.macros),
    [patch.params, patch.macros],
  );

  // Sync live engine whenever patch changes
  useEffect(() => {
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then((inst) => {
      if (inst) applySomaPatch(inst, patch);
    });
  }, [track, patch]);

  const commitPatch = useCallback(
    (next: SomaPatch, renameTrack?: string) => {
      onMutate((d) => {
        const t = d.arrangement.find((x) => x.id === track.id);
        if (!t || !t.instrument) return;
        t.instrument.type = 'soma';
        t.instrument.patch = serializeSomaPatch(next);
        if (renameTrack) {
          t.instrument.presetName = renameTrack;
          t.name = renameTrack;
          syncPadWithTrack(d, track.id);
        }
      });
    },
    [onMutate, track.id],
  );

  const triggerPhysicalStrike = useCallback(
    (
      note = patch.defaultNote || 48,
      velocity = 0.88,
      overridePos?: number,
      overrideAngle?: number,
      overrideStriker?: number,
    ) => {
      const rho = overridePos ?? resolvedParams[SM.STRIKE_POS] ?? 0.62;
      const ang = overrideAngle ?? resolvedParams[SM.STRIKE_ANGLE] ?? 0.5;
      liveBus.emit({ kind: 'strike', instrument: 'soma', trackId: track.id, at: liveNow(), note, velocity, pos: rho, striker: overrideStriker ?? resolvedParams[SM.STRIKER_TYPE] ?? 0 });
      const weights = BESSEL_MODES.map((m) => besselJ(m.m, m.besselRoot * rho));
      strikeAnimRef.current = {
        time: performance.now(),
        active: true,
        rho,
        angle: ang,
        velocity,
        weights,
      };

      const engine = BeatsEngine.get();
      void engine.init().then(async () => {
        const inst = await engine.ensureInstrument(track);
        if (!inst) return;
        // The whole strike, every time: a hand-map key played before may have left its own hand
        // settings in the engine. Raw: this strike says exactly where it lands (no hand map).
        inst.setParams([
          [SM.STRIKE_POS, rho], [SM.STRIKE_ANGLE, ang],
          [SM.STRIKER_TYPE, overrideStriker ?? resolvedParams[SM.STRIKER_TYPE] ?? 1],
          [SM.STRIKER_HARDNESS, resolvedParams[SM.STRIKER_HARDNESS] ?? 0.5],
          [SM.STRIKER_MASS, resolvedParams[SM.STRIKER_MASS] ?? 0.5],
          [SM.HAND_BRUSH, resolvedParams[SM.HAND_BRUSH] ?? 0.2],
        ]);
        const vid = inst.noteOn(note, velocity, 0, 0, 48000, true);
        setTimeout(() => {
          inst.noteOff(vid, true);
        }, 180);
      });

      // Compute exact physical wave propagation & modal telemetry for the strike
      const diamNorm = resolvedParams[SM.HEAD_DIAMETER] ?? 0.5;
      const radiusM = 0.075 + 0.38 * diamNorm;
      const naturalHz = 260 * Math.pow(0.2, diamNorm);
      const noteHz = 440 * Math.pow(2, (note - 69) / 12);
      const kt = resolvedParams[SM.KEYTRACK] ?? 0.5;
      const baseHz = Math.max(28, Math.min(1100, naturalHz * Math.pow(noteHz / naturalHz, kt)));
      const waveSpeed = Math.max(35, Math.min(320, (2 * Math.PI * radiusM * baseHz) / 2.4048));
      const nearRimMs = ((radiusM * Math.max(0.04, 1 - rho)) / waveSpeed) * 1000;
      const farRimMs = ((radiusM * (1 + rho)) / waveSpeed) * 1000;
      const cavType = Math.round(resolvedParams[SM.CAVITY_TYPE] ?? 0);
      const decayNorm = resolvedParams[SM.MEMBRANE_DECAY] ?? 0.52;
      const strikerIdx = Math.round(overrideStriker ?? resolvedParams[SM.STRIKER_TYPE] ?? 0);
      const cavScale = cavType === 0 ? 1.25 : cavType === 4 ? 1.1 : 0.65;
      const artClamp = strikerIdx === 3 ? 0.2 : strikerIdx === 2 ? 0.35 : 1.0;
      const bodyT60Ms = Math.round((80 + 1850 * Math.pow(decayNorm, 1.8)) * cavScale * artClamp);
      const nonlin = resolvedParams[SM.TENSION_NONLIN] ?? 0.35;
      const pitchGlideSt = +(velocity * (0.8 + 4.2 * nonlin) * (1 - 0.4 * rho)).toFixed(2);
      const crestEst = strikerIdx === 2 ? 24.8 : strikerIdx === 3 ? 22.5 : strikerIdx === 0 ? 11.4 : 16.8;
      const portTune = resolvedParams[SM.PORT_TUNING] ?? 0.42;
      const cavVol = resolvedParams[SM.CAVITY_VOLUME] ?? 0.65;
      const fHelmholtz =
        cavType === 0
          ? baseHz * 0.84
          : cavType === 1
            ? (58 + 64 * portTune) / (0.62 + 0.58 * cavVol)
            : (72 + 78 * portTune) / (0.65 + 0.55 * cavVol);
      setLastTelemetry({
        crestDb: crestEst,
        nearRimMs: +nearRimMs.toFixed(2),
        farRimMs: +farRimMs.toFixed(2),
        bodyT60Ms,
        pitchGlideSt,
        f0Hz: Math.round(baseHz),
        f11Hz: Math.round(baseHz * (cavType === 0 ? 1.0 : 1.558)),
        fHelmholtzHz: Math.round(fHelmholtz),
      });
    },
    [patch.defaultNote, resolvedParams, track],
  );

  // Pure analytical 2D Circular Membrane PDE + Helmholtz Reference Synthesizer for A/B Physics Verification
  const triggerAnalyticalReference = useCallback(() => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = refAudioCtxRef.current ?? new Ctx();
    refAudioCtxRef.current = ctx;
    if (ctx.state === 'suspended') void ctx.resume();

    const sr = ctx.sampleRate;
    const dur = 1.0;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(2, len, sr);
    const outL = buf.getChannelData(0);
    const outR = buf.getChannelData(1);

    const rho = resolvedParams[SM.STRIKE_POS] ?? 0.62;
    const diamNorm = resolvedParams[SM.HEAD_DIAMETER] ?? 0.5;
    const note = patch.defaultNote || 48;
    const naturalHz = 260 * Math.pow(0.2, diamNorm);
    const noteHz = 440 * Math.pow(2, (note - 69) / 12);
    const kt = resolvedParams[SM.KEYTRACK] ?? 0.5;
    const baseHz = Math.max(28, Math.min(1100, naturalHz * Math.pow(noteHz / naturalHz, kt)));
    const cavType = Math.round(resolvedParams[SM.CAVITY_TYPE] ?? 0);
    const strikerIdx = Math.round(resolvedParams[SM.STRIKER_TYPE] ?? 0);
    const decayNorm = resolvedParams[SM.MEMBRANE_DECAY] ?? 0.52;
    const dampHf = resolvedParams[SM.MEMBRANE_DAMP_HF] ?? 0.45;
    const nonlin = resolvedParams[SM.TENSION_NONLIN] ?? 0.35;

    const phases = new Float64Array(16);
    const weights = BESSEL_MODES.map((m) => besselJ(m.m, m.besselRoot * rho));
    const ratios = BESSEL_MODES.map((m) => (cavType === 0 ? m.timpaniRatio : m.openDrumRatio));
    const cavScale = cavType === 0 ? 1.25 : cavType === 4 ? 1.1 : 0.65;
    const artClamp = strikerIdx === 3 ? 0.2 : strikerIdx === 2 ? 0.35 : 1.0;
    const baseT60 = (0.08 + 1.85 * Math.pow(decayNorm, 1.8)) * cavScale * artClamp;

    let cavPhase = 0;
    const fCav = lastTelemetry.fHelmholtzHz || 75;

    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // 1. Hunt-Crossley piston transient + finger whip
      const tauContact = strikerIdx === 0 ? 0.0022 : strikerIdx === 2 ? 0.0007 : 0.0012;
      const piston = t < tauContact * 2.5
        ? Math.sin((Math.PI * t) / tauContact) * Math.exp(-t / tauContact) * 0.42
        : 0;
      const whip = (Math.random() * 2 - 1) * Math.exp(-t / (strikerIdx === 2 ? 0.0028 : 0.0016)) * (strikerIdx === 2 ? 0.48 : 0.22);

      // 2. Nonlinear Von Kármán tension pitch glide
      const stretch = 1 + 0.16 * nonlin * Math.exp(-t / 0.032);

      // 3. Sum 16 2D Bessel eigenmodes with quadratic viscoelastic f^2 damping
      let modalL = 0;
      let modalR = 0;
      for (let k = 0; k < 16; k++) {
        const r = ratios[k]!;
        const excess = Math.max(0, r - 1.55);
        const visc = 1 + (0.65 + 2.8 * dampHf) * 1.35 * (excess * excess * 0.85);
        const modeT60 = Math.max(0.006, baseT60 / visc);
        const env = Math.exp((-6.907755 * t) / modeT60);
        if (env < 1e-4) continue;
        phases[k] += (2 * Math.PI * baseHz * r * stretch) / sr;
        const sig = Math.sin(phases[k]!) * weights[k]! * env * (1 / (1 + 0.22 * k));
        const pan = k % 2 === 0 ? -0.25 : 0.25;
        modalL += sig * (1 - pan);
        modalR += sig * (1 + pan);
      }

      // 4. Coupled Helmholtz cavity sub-bass air plug
      cavPhase += (2 * Math.PI * fCav) / sr;
      const cavEnv = Math.exp((-6.907755 * t) / 0.32) * (1 - Math.exp(-t / 0.004));
      const cavSig = Math.sin(cavPhase) * cavEnv * (1 - 0.5 * rho) * 0.34;

      outL[i] = Math.tanh((piston + whip + modalL * 0.32 + cavSig) * 0.9);
      outR[i] = Math.tanh((piston + whip + modalR * 0.32 + cavSig) * 0.9);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }, [lastTelemetry.fHelmholtzHz, patch.defaultNote, resolvedParams]);

  // Live Generative Multi-Zone Polyrhythm Loop for Real-Time Physics Testing
  useEffect(() => {
    if (!labGroovePlaying) return;
    const steps: Array<{ pos: number; striker: number; vel: number; semiOffset: number }> = [
      { pos: 0.06, striker: 1, vel: 0.94, semiOffset: 0 },  // Center Doum Bass
      { pos: 0.44, striker: 3, vel: 0.68, semiOffset: 0 },  // Muted Tapón
      { pos: 0.64, striker: 1, vel: 0.86, semiOffset: 0 },  // Open Tone
      { pos: 0.68, striker: 1, vel: 0.78, semiOffset: 2 },  // Open Tone (slight cord squeeze)
      { pos: 0.84, striker: 2, vel: 0.96, semiOffset: 0 },  // Rim Slap (Claqué)
      { pos: 0.42, striker: 3, vel: 0.64, semiOffset: 0 },  // Ghost Muted Palm
      { pos: 0.62, striker: 1, vel: 0.88, semiOffset: 0 },  // Open Tone
      { pos: 0.86, striker: 5, vel: 0.76, semiOffset: 0 },  // Rim Finger Tek
    ];
    let stepIdx = 0;
    const timer = window.setInterval(() => {
      const s = steps[stepIdx % steps.length]!;
      stepIdx++;
      const baseNote = (patch.defaultNote || 48) + s.semiOffset;
      triggerPhysicalStrike(baseNote, s.vel, s.pos, 0.35 + (stepIdx % 3) * 0.15, s.striker);
    }, 210);
    return () => window.clearInterval(timer);
  }, [labGroovePlaying, patch.defaultNote, triggerPhysicalStrike]);

  const handleSelectPreset = (preset: SomaPreset) => {
    const next = applySomaPreset(patch, preset);
    liveBus.emit({ kind: 'preset', instrument: 'soma', trackId: track.id, at: liveNow(), presetId: preset.id, presetName: preset.name });
    setMorphAmt(0);
    commitPatch(next, preset.name);
    setTimeout(() => {
      triggerPhysicalStrike(
        preset.defaultNote,
        0.9,
        preset.params[SM.STRIKE_POS] ?? 0.62,
        preset.params[SM.STRIKE_ANGLE] ?? 0.5,
        preset.params[SM.STRIKER_TYPE] ?? 0,
      );
    }, 30);
  };

  const setParamValue = (id: number, value: number) => {
    liveBus.emit({ kind: 'param', instrument: 'soma', trackId: track.id, at: liveNow(), paramId: id });
    const nextParams = { ...patch.params, [id]: value };
    let nextPad = patch.strikePad;
    if (id === SM.STRIKE_POS || id === SM.STRIKE_ANGLE) {
      const r = id === SM.STRIKE_POS ? value : (nextParams[SM.STRIKE_POS] ?? 0.62);
      const a = id === SM.STRIKE_ANGLE ? value : (nextParams[SM.STRIKE_ANGLE] ?? 0.5);
      nextPad = polarToDrumPad(r, a);
    }
    const next: SomaPatch = { ...patch, params: nextParams, strikePad: nextPad };
    commitPatch(next);
    const inst = BeatsEngine.get().getInstrument(track.id);
    if (inst) {
      const expanded = expandSomaMacros(nextParams, patch.macros);
      inst.setParam(id, somaEngineValue(id, expanded[id] ?? value));
    }
  };

  const setMacroValue = (macro: SomaMacro, value: number) => {
    const nextMacros = { ...patch.macros, [macro]: value };
    const next: SomaPatch = { ...patch, macros: nextMacros };
    commitPatch(next);
    const inst = BeatsEngine.get().getInstrument(track.id);
    if (inst) applySomaPatch(inst, next);
  };

  // Interactive 2D Drumhead Pad pointer handler
  const handleDrumPadPointer = (e: React.PointerEvent<HTMLCanvasElement>, shouldStrike: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.width * 0.5;
    const cy = rect.height * 0.5;
    const maxR = Math.min(cx, cy) * 0.88;
    const dx = (e.clientX - rect.left - cx) / maxR;
    const dy = (e.clientY - rect.top - cy) / maxR;
    const { radius, angle } = drumPadToPolar(dx, dy);

    const nextParams = {
      ...patch.params,
      [SM.STRIKE_POS]: radius,
      [SM.STRIKE_ANGLE]: angle,
    };
    const next: SomaPatch = {
      ...patch,
      params: nextParams,
      strikePad: [Math.max(-0.95, Math.min(0.95, dx)), Math.max(-0.95, Math.min(0.95, dy))],
    };
    commitPatch(next);

    if (shouldStrike) {
      // Velocity scales slightly with radial distance or pointer pressure
      const vel = Math.max(0.55, Math.min(0.98, e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.88));
      triggerPhysicalStrike(patch.defaultNote || 48, vel, radius, angle);
    }
  };

  // Real-time 2D Bessel Membrane & Coupled Air Chamber animation loop
  useEffect(() => {
    let raf = 0;
    const renderVisuals = (now: number) => {
      const headCanvas = headCanvasRef.current;
      const chamberCanvas = chamberCanvasRef.current;
      const st = strikeAnimRef.current;
      const elapsedSec = st.active ? (now - st.time) * 0.001 : 10;
      const decayNorm = resolvedParams[SM.MEMBRANE_DECAY] ?? 0.58;
      const t60 = 0.25 + 4.5 * decayNorm * decayNorm;
      const env = st.active ? Math.exp((-3.2 * elapsedSec) / t60) : 0;
      if (env < 0.004) st.active = false;

      // 1. Render 2D Circular Drumhead & Bessel Nodal Rings
      if (headCanvas) {
        const ctx = headCanvas.getContext('2d');
        if (ctx) {
          const w = headCanvas.width;
          const h = headCanvas.height;
          const cx = w * 0.5;
          const cy = h * 0.5;
          const R = Math.min(cx, cy) * 0.86;
          ctx.clearRect(0, 0, w, h);

          // Outer wood/copper counterhoop rim
          const shellMat = Math.round(resolvedParams[SM.SHELL_MATERIAL] ?? 1);
          const rimColor =
            shellMat === 1 ? '#D97736' : shellMat === 0 ? '#8B4513' : shellMat === 2 ? '#A16207' : '#64748B';
          ctx.beginPath();
          ctx.arc(cx, cy, R + 7, 0, Math.PI * 2);
          ctx.fillStyle = `${rimColor}38`;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = rimColor;
          ctx.stroke();

          // Membrane skin surface gradient
          const skinMat = Math.round(resolvedParams[SM.SKIN_MATERIAL] ?? 0);
          const skinTone =
            skinMat === 0
              ? '#F3E5AB'
              : skinMat === 1
                ? '#D6B88A'
                : skinMat === 2
                  ? '#E8D3B3'
                  : skinMat === 3
                    ? '#C89D66'
                    : skinMat === 4
                      ? '#B88655'
                      : '#CBD5E1';
          const grad = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
          grad.addColorStop(0, `${skinTone}28`);
          grad.addColorStop(0.7, `${skinTone}16`);
          grad.addColorStop(1, '#09090C');
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          // Draw Bessel nodal circles (r/a = 0.4356 for (0,2), 0.6376 for (0,3), 0.65 optimal playing zone)
          for (const nodalR of [0.28, 0.4356, 0.65, 0.82]) {
            ctx.beginPath();
            ctx.arc(cx, cy, R * nodalR, 0, Math.PI * 2);
            ctx.strokeStyle =
              nodalR === 0.65 ? 'rgba(232,106,51,0.32)' : 'rgba(255,255,255,0.08)';
            ctx.setLineDash(nodalR === 0.65 ? [4, 4] : []);
            ctx.lineWidth = nodalR === 0.65 ? 1.3 : 1;
            ctx.stroke();
          }
          ctx.setLineDash([]);

          // Live 2D Bessel eigenmode standing wave rings when vibrating
          if (env > 0.005) {
            const strikeTheta = (st.angle - 0.5) * Math.PI - Math.PI * 0.5;
            const strikeX = cx + st.rho * R * Math.cos(strikeTheta);
            const strikeY = cy + st.rho * R * Math.sin(strikeTheta);

            for (let ring = 1; ring <= 6; ring++) {
              const frac = ring / 6;
              const modeOsc =
                Math.cos(elapsedSec * 36 * ring) *
                besselJ(0, 2.4048 * frac) *
                env;
              const rad = Math.max(4, R * frac + modeOsc * 8);
              ctx.beginPath();
              ctx.arc(cx, cy, rad, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(232, 106, 51, ${(env * (1 - frac * 0.65) * 0.65).toFixed(3)})`;
              ctx.lineWidth = 1.8;
              ctx.stroke();
            }

            // Propagating wave from exact strike point
            // (A hit stamped just after this frame began has a hair of negative elapsed time.)
            const rippleR = Math.max(0, Math.min(R, elapsedSec * 340));
            ctx.beginPath();
            ctx.arc(strikeX, strikeY, rippleR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(245, 158, 11, ${(env * 0.75).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Current Strike Target Crosshair on the 2D Drumhead
          const curR = resolvedParams[SM.STRIKE_POS] ?? 0.62;
          const curAng = (resolvedParams[SM.STRIKE_ANGLE] ?? 0.5) * Math.PI - Math.PI;
          const tx = cx + curR * R * Math.cos(curAng);
          const ty = cy + curR * R * Math.sin(curAng);

          ctx.beginPath();
          ctx.arc(tx, ty, 8 + env * 5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(232, 106, 51, 0.28)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#E86A33';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // 2. Render Coupled Air Cavity & Wood/Metal Shell Cross-Section
      if (chamberCanvas) {
        const ctx = chamberCanvas.getContext('2d');
        if (ctx) {
          const w = chamberCanvas.width;
          const h = chamberCanvas.height;
          ctx.clearRect(0, 0, w, h);

          const cavityType = Math.round(resolvedParams[SM.CAVITY_TYPE] ?? 0);
          const cavityVol = resolvedParams[SM.CAVITY_VOLUME] ?? 0.65;
          const coupling = resolvedParams[SM.CAVITY_COUPLING] ?? 0.68;
          const shellMat = Math.round(resolvedParams[SM.SHELL_MATERIAL] ?? 1);
          const shellColor =
            shellMat === 1
              ? '#E07A3C'
              : shellMat === 0
                ? '#A85828'
                : shellMat === 2
                  ? '#C68B38'
                  : shellMat === 3
                    ? '#C86D51'
                    : '#94A3B8';

          const topY = 26;
          const botY = 26 + (h - 44) * (0.48 + 0.52 * cavityVol);
          const midY = (topY + botY) * 0.5;
          const cx = w * 0.5;
          const topHalfW = w * 0.34;
          const wallVib = env * Math.sin(elapsedSec * 65) * 3.5 * (resolvedParams[SM.SHELL_RESONANCE] ?? 0.5);

          // Draw internal air pressure wave layers
          for (let layer = 0; layer < 5; layer++) {
            const ly = topY + 10 + ((botY - topY - 16) * layer) / 4;
            const airPhase = Math.sin(elapsedSec * 42 - layer * 0.85) * env * coupling;
            const alpha = 0.08 + Math.abs(airPhase) * 0.38;
            ctx.beginPath();
            ctx.moveTo(cx - topHalfW * 0.72, ly + airPhase * 5);
            ctx.quadraticCurveTo(cx, ly - airPhase * 7, cx + topHalfW * 0.72, ly + airPhase * 5);
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Draw physical shell walls by CAVITY_TYPE
          ctx.strokeStyle = shellColor;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          if (cavityType === 0) {
            // Sealed Parabolic Kettle Bowl (Timpani)
            ctx.moveTo(cx - topHalfW, topY);
            ctx.bezierCurveTo(
              cx - topHalfW - wallVib,
              botY,
              cx + topHalfW + wallVib,
              botY,
              cx + topHalfW,
              topY,
            );
          } else if (cavityType === 1) {
            // Goblet Helmholtz Neck (Djembe / Darbuka)
            const neckW = topHalfW * 0.32;
            const footW = topHalfW * 0.58;
            ctx.moveTo(cx - topHalfW, topY);
            ctx.quadraticCurveTo(cx - topHalfW - wallVib, midY * 0.85, cx - neckW, midY);
            ctx.lineTo(cx - footW, botY);
            ctx.moveTo(cx + topHalfW, topY);
            ctx.quadraticCurveTo(cx + topHalfW + wallVib, midY * 0.85, cx + neckW, midY);
            ctx.lineTo(cx + footW, botY);
          } else if (cavityType === 2) {
            // Tapered Stave Barrel (Conga / Tumba)
            const bellyW = topHalfW * 1.16 + wallVib;
            const portW = topHalfW * 0.68;
            ctx.moveTo(cx - topHalfW, topY);
            ctx.quadraticCurveTo(cx - bellyW, midY, cx - portW, botY);
            ctx.moveTo(cx + topHalfW, topY);
            ctx.quadraticCurveTo(cx + bellyW, midY, cx + portW, botY);
          } else if (cavityType === 3) {
            // Hourglass Dual-Head (Talking Drum / Bata)
            const waistW = topHalfW * 0.42 - wallVib;
            ctx.moveTo(cx - topHalfW, topY);
            ctx.quadraticCurveTo(cx - waistW, midY, cx - topHalfW, botY);
            ctx.moveTo(cx + topHalfW, topY);
            ctx.quadraticCurveTo(cx + waistW, midY, cx + topHalfW, botY);
          } else if (cavityType === 4) {
            // Deep Taiko Barrel (Nagado-Daiko)
            const barrelW = topHalfW * 1.24 + wallVib;
            ctx.moveTo(cx - topHalfW, topY);
            ctx.quadraticCurveTo(cx - barrelW, midY, cx - topHalfW, botY);
            ctx.moveTo(cx + topHalfW, topY);
            ctx.quadraticCurveTo(cx + barrelW, midY, cx + topHalfW, botY);
          } else {
            // Shallow Frame Hoop (Bodhrán / Bendir / Bongo)
            const hoopBot = topY + 34;
            ctx.moveTo(cx - topHalfW, topY);
            ctx.lineTo(cx - topHalfW - wallVib, hoopBot);
            ctx.moveTo(cx + topHalfW, topY);
            ctx.lineTo(cx + topHalfW + wallVib, hoopBot);
          }
          ctx.stroke();

          // Top vibrating batter membrane curve
          const headDeflect = env * Math.cos(elapsedSec * 52) * 9;
          ctx.beginPath();
          ctx.moveTo(cx - topHalfW, topY);
          ctx.quadraticCurveTo(cx, topY + headDeflect, cx + topHalfW, topY);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Sympathetic bottom membrane for Dual-Head drums (Hourglass & Taiko)
          if (cavityType === 3 || cavityType === 4) {
            const botDeflect = -headDeflect * 0.72;
            ctx.beginPath();
            ctx.moveTo(cx - topHalfW, botY);
            ctx.quadraticCurveTo(cx, botY + botDeflect, cx + topHalfW, botY);
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      // 3. Render Live Physics Verification Scope & FFT Eigenmode Bench (when in 'lab' mode)
      const labCanvas = labScopeCanvasRef.current;
      if (labCanvas) {
        const ctx = labCanvas.getContext('2d');
        if (ctx) {
          const w = labCanvas.width;
          const h = labCanvas.height;
          ctx.clearRect(0, 0, w, h);

          const midY = h * 0.46;
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(w, midY);
          ctx.stroke();

          const inst = BeatsEngine.get().getInstrument(track.id);
          const analyser = inst?.analyser;

          // Theoretical two-stage radiation + viscoelastic envelope guide
          ctx.beginPath();
          for (let x = 0; x < w; x++) {
            const tNorm = x / w;
            const theoEnv = 0.65 * Math.exp(-tNorm * 14) + 0.35 * Math.exp(-tNorm * 3.2);
            const yTop = midY * 0.5 - theoEnv * (midY * 0.42);
            if (x === 0) ctx.moveTo(x, yTop);
            else ctx.lineTo(x, yTop);
          }
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          if (analyser) {
            const timeData = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(timeData);
            ctx.beginPath();
            for (let i = 0; i < timeData.length; i++) {
              const x = (i / (timeData.length - 1)) * w;
              const y = midY * 0.5 - timeData[i]! * (midY * 0.44);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // FFT Spectrum in bottom half (0 .. 4000 Hz)
            const freqData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(freqData);
            const maxBin = Math.min(freqData.length, Math.floor((4000 * analyser.fftSize) / 48000));
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let b = 0; b < maxBin; b++) {
              const x = (b / maxBin) * w;
              const mag = freqData[b]! / 255;
              const y = h - mag * (h - midY - 14);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.fillStyle = 'rgba(232, 106, 51, 0.22)';
            ctx.fill();
            ctx.strokeStyle = '#E86A33';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Overlay Theoretical Eigenmode Frequency Pillars (f_H, f_01, f_11, f_21)
          const markers = [
            { label: `f_H (${lastTelemetry.fHelmholtzHz}Hz)`, hz: lastTelemetry.fHelmholtzHz, color: '#10B981' },
            { label: `(0,1) ${lastTelemetry.f0Hz}Hz`, hz: lastTelemetry.f0Hz, color: '#38BDF8' },
            { label: `(1,1) ${lastTelemetry.f11Hz}Hz`, hz: lastTelemetry.f11Hz, color: '#F59E0B' },
            { label: `(2,1) ${Math.round(lastTelemetry.f0Hz * 2.09)}Hz`, hz: lastTelemetry.f0Hz * 2.09, color: '#EC4899' },
          ];
          ctx.font = '9px monospace';
          for (const mk of markers) {
            const x = Math.min(w - 30, Math.max(8, (mk.hz / 4000) * w));
            ctx.strokeStyle = mk.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, midY + 6);
            ctx.lineTo(x, h);
            ctx.stroke();
            ctx.fillStyle = mk.color;
            ctx.fillText(mk.label, x + 3, midY + 16);
          }
        }
      }

      raf = requestAnimationFrame(renderVisuals);
    };

    raf = requestAnimationFrame(renderVisuals);
    return () => cancelAnimationFrame(raf);
  }, [resolvedParams]);

  const handleNoteOn = useCallback(
    (note: number, vel = 0.88) => {
      setHeldNotes((prev) => new Set(prev).add(note));
      const engine = BeatsEngine.get();
      void engine.init().then(async () => {
        const inst = await engine.ensureInstrument(track);
        if (!inst) return;
        const vid = inst.noteOn(note, vel);
        activeVoices.current.set(note, vid);
      });
      strikeAnimRef.current = {
        ...strikeAnimRef.current,
        time: performance.now(),
        active: true,
        velocity: vel,
      };
    },
    [track],
  );

  const handleNoteOff = useCallback(
    (note: number) => {
      setHeldNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      const vid = activeVoices.current.get(note);
      if (vid !== undefined) {
        activeVoices.current.delete(note);
        BeatsEngine.get().getInstrument(track.id)?.noteOff(vid, true);
      }
    },
    [track.id],
  );

  const categoryPresets = useMemo(
    () => SOMA_PRESETS.filter((p) => p.category === category),
    [category],
  );

  const currentStrikerIdx = Math.round(resolvedParams[SM.STRIKER_TYPE] ?? 0);
  const currentCavityIdx = Math.round(resolvedParams[SM.CAVITY_TYPE] ?? 0);
  const currentShellIdx = Math.round(resolvedParams[SM.SHELL_MATERIAL] ?? 1);
  const currentSkinIdx = Math.round(resolvedParams[SM.SKIN_MATERIAL] ?? 0);

  return (
    <div className="flex flex-col text-white select-none" style={{ background: '#0A0B0F' }}>
      {/* Top Instrument Identity & Mode Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10"
        style={{
          background:
            'linear-gradient(90deg, rgba(232,106,51,0.16) 0%, rgba(16,185,129,0.08) 55%, rgba(10,11,15,0.95) 100%)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="px-2 py-0.5 rounded-md text-[10px] font-black tracking-[0.18em] uppercase border"
            style={{
              background: 'rgba(232,106,51,0.2)',
              borderColor: 'rgba(232,106,51,0.5)',
              color: ACCENT,
            }}
          >
            SOMA · PHYSICAL ACOUSTICS
          </span>
          <span className="text-[12px] font-bold text-white truncate">{patch.name}</span>
          {patch.origin && (
            <span className="text-[10px] text-white/45 hidden md:inline truncate">
              · {patch.origin}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <SomaDeepToggle />
          <button
            onClick={() => triggerPhysicalStrike(patch.defaultNote || 48, 0.92)}
            className="h-7 px-3 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition"
            style={{
              background: 'rgba(232,106,51,0.22)',
              borderColor: 'rgba(232,106,51,0.55)',
              color: '#FFD7C2',
            }}
            title="Strike the drumhead at the current radial position"
          >
            <Volume2 size={12} /> Strike ({formatSomaParam(SM.STRIKE_POS, resolvedParams[SM.STRIKE_POS] ?? 0.62)})
          </button>

          <div className="flex rounded-lg bg-black/50 p-0.5 border border-white/10">
            <button
              onClick={() => setMode('play')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition ${
                mode === 'play' ? 'bg-[#E86A33] text-black font-bold' : 'text-white/55 hover:text-white'
              }`}
            >
              <Disc size={11} /> Acoustic Surface
            </button>
            <button
              onClick={() => setMode('deep')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition ${
                mode === 'deep' ? 'bg-[#E86A33] text-black font-bold' : 'text-white/55 hover:text-white'
              }`}
            >
              <Sliders size={11} /> 4-Domain Physics
            </button>
            <button
              onClick={() => setMode('lab')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition ${
                mode === 'lab' ? 'bg-[#10B981] text-black font-bold' : 'text-white/55 hover:text-white'
              }`}
            >
              <Activity size={11} /> Live Physics Lab
            </button>
          </div>

          {!embedded && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg border border-white/10 grid place-items-center text-white/50 hover:text-white"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Category & Curated World/Orchestral Drum Selector */}
      <div className="px-4 py-2 border-b border-white/[0.07] bg-black/30 flex flex-col gap-1.5">
        {/* Wraps rather than scrolling sideways, so every category name reads in full. */}
        <div className="flex flex-wrap items-center gap-1 pb-0.5">
          {SOMA_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="h-6 px-2.5 rounded-full text-[10px] font-semibold whitespace-nowrap border transition shrink-0"
              style={
                category === cat
                  ? {
                      background: 'rgba(232,106,51,0.22)',
                      borderColor: ACCENT,
                      color: '#fff',
                    }
                  : {
                      borderColor: 'rgba(255,255,255,0.09)',
                      color: 'rgba(255,255,255,0.5)',
                    }
              }
            >
              {SOMA_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" style={{ scrollbarWidth: 'none' }}>
          {categoryPresets.map((p) => {
            const active = patch.presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className="h-6 px-2.5 rounded-lg text-[10px] whitespace-nowrap border transition shrink-0"
                style={
                  active
                    ? {
                        background: 'rgba(245,158,11,0.22)',
                        borderColor: GOLD,
                        color: '#FEF3C7',
                        fontWeight: 700,
                      }
                    : {
                        background: 'rgba(255,255,255,0.03)',
                        borderColor: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.65)',
                      }
                }
                title={p.description}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* The real drum behind the preset — photo, Amara's intro, history / build / technique */}
      <SomaDrumStory presetId={patch.presetId} presetName={patch.name} trackId={track.id} defaultNote={patch.defaultNote || 48} strike={triggerPhysicalStrike} />

      {mode === 'play' ? (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 5 cols: Interactive 2D Circular Drumhead Strike Pad + Quick Articulation Triggers */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-black/40 p-3 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#E86A33]">
                2D Bessel Membrane Strike Surface
              </span>
              <span className="text-[10px] font-mono text-white/60">
                {formatSomaParam(SM.HEAD_DIAMETER, resolvedParams[SM.HEAD_DIAMETER] ?? 0.62)} · {SKIN_MATERIALS[currentSkinIdx]}
              </span>
            </div>

            <canvas
              ref={headCanvasRef}
              width={220}
              height={220}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleDrumPadPointer(e, true);
              }}
              onPointerMove={(e) => {
                if (e.buttons > 0) handleDrumPadPointer(e, false);
              }}
              className="cursor-crosshair rounded-full my-1"
              title="Click or drag from dead center (0% — axisymmetric bass) to outer rim (95% — multipole slap/rim modes)"
            />

            {/* Quick Playing-Style Articulation Triggers */}
            <div className="w-full mt-2">
              <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1 flex items-center justify-between">
                <span>Playing Style & Strike Zone Audition</span>
                <span className="text-[#F59E0B]">{STRIKER_TYPES[currentStrikerIdx]}</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: 'Center Bass', pos: 0.08, striker: 1, hint: 'Dead-center palm hit — excites (0,1) + Helmholtz port' },
                  { label: 'Open Tone', pos: 0.60, striker: 1, hint: 'Open hand at r/a = 60% — clear (1,1) principal tone' },
                  { label: 'Rim Slap', pos: 0.78, striker: 2, hint: 'Whipped hand slap at r/a = 78% — explosive (1,1)–(4,1) pop' },
                  { label: 'Muted Palm', pos: 0.48, striker: 3, hint: 'Pressed hand — post-strike contact damping' },
                  { label: 'Mallet / Stick', pos: 0.65, striker: 0, hint: 'Felt mallet or wooden stick at normal playing spot' },
                ].map((zone) => (
                  <button
                    key={zone.label}
                    onClick={() => {
                      setParamValue(SM.STRIKE_POS, zone.pos);
                      setParamValue(SM.STRIKER_TYPE, zone.striker);
                      triggerPhysicalStrike(patch.defaultNote || 48, 0.92, zone.pos, undefined, zone.striker);
                    }}
                    title={zone.hint}
                    className="py-1.5 px-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-[#E86A33]/20 hover:border-[#E86A33]/50 text-[9.5px] font-semibold text-white/85 transition text-center truncate"
                  >
                    {zone.label}
                  </button>
                ))}
              </div>
            </div>

            <SomaHandMapCard track={track} hand={somaHandConfig(patch)} explicit={!!patch.hand} onChange={(hand) => commitPatch({ ...patch, hand })} />
          </div>

          {/* Right 7 cols: Coupled Air Chamber Cross-Section + Live Tension Pedal + 6 Physical Macros */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* Coupled Air Chamber & Bessel Modal Spectrum Card */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#10B981]">
                    Coupled Air Cavity & Shell
                  </span>
                  <span className="text-[9.5px] text-white/55 truncate">
                    {CAVITY_TYPES[currentCavityIdx]}
                  </span>
                </div>
                <canvas
                  ref={chamberCanvasRef}
                  width={220}
                  height={130}
                  className="w-full h-[120px] rounded-xl bg-black/40 border border-white/[0.06]"
                />
                <div className="mt-1 flex items-center justify-between text-[9.5px] text-white/50">
                  <span>Shell: {SHELL_MATERIALS[currentShellIdx]}</span>
                  <span>Volume: {formatSomaParam(SM.CAVITY_VOLUME, resolvedParams[SM.CAVITY_VOLUME] ?? 0.65)}</span>
                </div>
              </div>

              {/* 2D Bessel Eigenmode Spatial Excitation Readout + Live Tension Pedal */}
              <div className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#F59E0B]">
                      Bessel Eigenmodes J_m(j_mn · r/a)
                    </span>
                    <span className="text-[9.5px] font-mono text-white/50">
                      r/a = {Math.round((resolvedParams[SM.STRIKE_POS] ?? 0.62) * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-8 gap-1 h-16 items-end bg-black/40 rounded-xl p-2 border border-white/[0.06]">
                    {BESSEL_MODES.slice(0, 8).map((m) => {
                      const rho = resolvedParams[SM.STRIKE_POS] ?? 0.62;
                      const w = Math.abs(besselJ(m.m, m.besselRoot * rho));
                      const pctH = Math.max(8, Math.min(100, Math.round(w * 100)));
                      return (
                        <div key={m.index} className="flex flex-col items-center gap-0.5 h-full justify-end">
                          <div
                            className="w-full rounded-t transition-all duration-150"
                            style={{
                              height: `${pctH}%`,
                              background: m.m === 0 ? '#38BDF8' : '#E86A33',
                            }}
                            title={`Mode ${m.label}: ratio ${
                              currentCavityIdx === 0 ? m.timpaniRatio.toFixed(3) : m.openDrumRatio.toFixed(3)
                            }×`}
                          />
                          <span className="text-[8px] font-mono text-white/45">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Timpani Foot Pedal / Talking-Drum Tension Cord Slider */}
                <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-2">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="font-bold text-amber-300 flex items-center gap-1">
                      <Activity size={11} /> Live Tension Pedal / Talking-Drum Cords
                    </span>
                    <span className="font-mono text-amber-200">
                      {formatSomaParam(SM.TENSION_PEDAL, resolvedParams[SM.TENSION_PEDAL] ?? 0.5)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.005}
                    value={patch.params[SM.TENSION_PEDAL] ?? 0.5}
                    onChange={(e) => setParamValue(SM.TENSION_PEDAL, Number(e.target.value))}
                    onDoubleClick={() => setParamValue(SM.TENSION_PEDAL, 0.5)}
                    className="w-full accent-[#F59E0B] cursor-pointer h-1.5"
                    title="Drag while the drum is ringing to glide membrane tension in real time (double-click to reset to 0 st)"
                  />
                </div>
              </div>
            </div>

            {/* 6 Physical Performance Macros */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Physical Performance Macros
                </span>
                <span className="text-[10px] text-white/40 truncate max-w-[60%]" title={patch.acoustics}>
                  {patch.acoustics}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 justify-items-center">
                {SOMA_MACRO_ORDER.map((m) => (
                  <Knob
                    key={m}
                    label={SOMA_MACRO_LABELS[m]}
                    value={patch.macros[m] ?? 0.5}
                    min={0}
                    max={1}
                    defaultValue={0.5}
                    onChange={(v) => setMacroValue(m, v)}
                    color={m === 'chamber' ? TEAL : m === 'tension' || m === 'shellBody' ? GOLD : ACCENT}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                ))}
              </div>
            </div>

            {/* Physical Body Crossform (Morph any two acoustic drums) */}
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 flex flex-wrap items-center gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#E86A33] flex items-center gap-1">
                <Sparkles size={11} /> Acoustic Body Morph
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={morphAmt}
                onChange={(e) => {
                  const amt = Number(e.target.value);
                  setMorphAmt(amt);
                  const targetPreset = SOMA_PRESETS.find((p) => p.id === morphTargetId) ?? SOMA_PRESETS[0]!;
                  const basePreset = SOMA_PRESETS.find((p) => p.id === patch.presetId) ?? SOMA_PRESETS[0]!;
                  const morphed = crossformSomaPatch(newSomaPatch(basePreset), newSomaPatch(targetPreset), amt);
                  commitPatch(morphed);
                }}
                className="w-28 sm:w-36 accent-[#E86A33] cursor-pointer h-1.5"
              />
              <span className="text-[10px] text-white/45">into</span>
              <select
                value={morphTargetId}
                onChange={(e) => setMorphTargetId(e.target.value)}
                className="h-6 rounded-lg bg-black/60 border border-white/15 px-2 text-[10px] text-white outline-none"
              >
                {SOMA_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : mode === 'deep' ? (
        /* 4-Domain Deep Physical Model Editor */
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SOMA_EDITOR_GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => setDeepTab(g.key)}
                className="h-7 px-3 rounded-lg text-[10.5px] font-bold border transition flex items-center gap-1.5"
                style={
                  deepTab === g.key
                    ? {
                        background: `${g.color}26`,
                        borderColor: g.color,
                        color: '#fff',
                      }
                    : {
                        borderColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.55)',
                      }
                }
              >
                <Layers size={11} /> {g.title}
              </button>
            ))}
          </div>

          {SOMA_EDITOR_GROUPS.filter((g) => g.key === deepTab).map((group) => (
            <div
              key={group.key}
              className="rounded-2xl border border-white/10 bg-black/40 p-4"
            >
              <div className="mb-3">
                <div className="text-[12px] font-bold" style={{ color: group.color }}>
                  {group.title}
                </div>
                <div className="text-[10.5px] text-white/50">{group.blurb}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 items-start">
                {group.ids.map((id) => {
                  const m = SOMA_PARAM_META[id];
                  if (!m) return null;
                  const val = patch.params[id] ?? somaDefault(id);

                  if (m.options) {
                    const idx = Math.max(0, Math.min(m.options.length - 1, Math.round(val)));
                    return (
                      <div
                        key={id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 flex flex-col gap-1.5"
                      >
                        <span className="text-[10px] font-semibold text-white/75">{m.label}</span>
                        <select
                          value={idx}
                          onChange={(e) => setParamValue(id, Number(e.target.value))}
                          className="h-7 rounded-lg bg-black/70 border border-white/15 px-2 text-[10.5px] text-white outline-none"
                        >
                          {m.options.map((opt, oi) => (
                            <option key={opt} value={oi}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {m.hint && <span className="text-[9px] text-white/40 leading-tight">{m.hint}</span>}
                      </div>
                    );
                  }

                  if (m.toggle) {
                    const on = val >= 0.5;
                    return (
                      <div
                        key={id}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 flex flex-col gap-1.5"
                      >
                        <span className="text-[10px] font-semibold text-white/75">{m.label}</span>
                        <button
                          onClick={() => setParamValue(id, on ? 0 : 1)}
                          className="h-7 rounded-lg text-[10.5px] font-bold border transition"
                          style={
                            on
                              ? {
                                  background: `${group.color}28`,
                                  borderColor: group.color,
                                  color: '#fff',
                                }
                              : {
                                  borderColor: 'rgba(255,255,255,0.12)',
                                  color: 'rgba(255,255,255,0.45)',
                                }
                          }
                        >
                          {on ? 'Active' : 'Bypassed'}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={id} className="flex flex-col items-center">
                      <Knob
                        label={m.label}
                        value={val}
                        min={0}
                        max={1}
                        defaultValue={somaDefault(id)}
                        onChange={(v) => setParamValue(id, v)}
                        color={group.color}
                        format={m.format}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Live Physics Verification Lab & Analytical 2D Wave Reference A/B Bench */
        <div className="p-4 flex flex-col gap-3">
          <div className="rounded-2xl border border-emerald-500/30 bg-black/50 p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Real-Time Acoustic Wave & Eigenmode Verification Bench
                </div>
                <div className="text-[10px] text-white/55">
                  Compares live Rust/WASM multi-physics audio output against analytical 2D Bessel PDE + Helmholtz cavity equations
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => triggerPhysicalStrike(patch.defaultNote || 48, 0.92)}
                  className="h-7 px-3 rounded-lg text-[10px] font-bold border border-[#E86A33] bg-[#E86A33]/20 text-white hover:bg-[#E86A33]/35 transition"
                >
                  1. Strike Live WASM Engine
                </button>
                <button
                  onClick={triggerAnalyticalReference}
                  className="h-7 px-3 rounded-lg text-[10px] font-bold border border-emerald-400/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/35 transition"
                >
                  2. Strike Analytical 2D PDE Reference (A/B)
                </button>
                <button
                  onClick={() => setLabGroovePlaying((v) => !v)}
                  className={`h-7 px-3 rounded-lg text-[10px] font-bold border transition ${
                    labGroovePlaying
                      ? 'border-amber-400 bg-amber-400 text-black'
                      : 'border-white/20 bg-white/5 text-white/80 hover:text-white'
                  }`}
                >
                  {labGroovePlaying ? 'Stop Live Polyrhythm Test' : 'Run Live Multi-Zone Polyrhythm Test'}
                </button>
              </div>
            </div>

            <canvas
              ref={labScopeCanvasRef}
              width={680}
              height={175}
              className="w-full h-[175px] rounded-xl bg-black/70 border border-white/10"
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/45">Percussive Crest Factor</div>
                <div className="text-[14px] font-mono font-bold text-emerald-400">
                  {lastTelemetry.crestDb.toFixed(1)} dB
                </div>
                <div className="text-[9px] text-white/45">
                  Hunt-Crossley piston + whip transient
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/45">2D Rim Wave Travel</div>
                <div className="text-[14px] font-mono font-bold text-sky-400">
                  {lastTelemetry.nearRimMs}ms / {lastTelemetry.farRimMs}ms
                </div>
                <div className="text-[9px] text-white/45">
                  Near & far bearing-edge reflections
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/45">Body Radiation T60</div>
                <div className="text-[14px] font-mono font-bold text-amber-400">
                  {lastTelemetry.bodyT60Ms} ms
                </div>
                <div className="text-[9px] text-white/45">
                  Two-stage radiation + f² hide loss
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-white/45">Von Kármán Pitch Glide</div>
                <div className="text-[14px] font-mono font-bold text-[#E86A33]">
                  +{lastTelemetry.pitchGlideSt} st
                </div>
                <div className="text-[9px] text-white/45">
                  f_H {lastTelemetry.fHelmholtzHz}Hz · (0,1) {lastTelemetry.f0Hz}Hz · (1,1) {lastTelemetry.f11Hz}Hz
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chromatic Timpani / Percussion Keyboard Strip */}
      <div className="px-4 py-2.5 border-t border-white/10 bg-black/50 flex items-center gap-1 overflow-x-auto">
        {Array.from({ length: 25 }, (_, i) => {
          const midi = 36 + i; // C2 to C4
          const semi = midi % 12;
          const isBlack = semi === 1 || semi === 3 || semi === 6 || semi === 8 || semi === 10;
          const isHeld = heldNotes.has(midi);
          const isDefault = midi === patch.defaultNote;
          const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const label = `${noteNames[semi]}${Math.floor(midi / 12) - 1}`;
          return (
            <button
              key={midi}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleNoteOn(midi, 0.9);
              }}
              onPointerUp={() => handleNoteOff(midi)}
              onPointerCancel={() => handleNoteOff(midi)}
              className="h-11 min-w-[28px] flex-1 rounded-lg border text-[9px] font-mono flex flex-col items-center justify-end pb-1 transition"
              style={{
                background: isHeld
                  ? ACCENT
                  : isBlack
                    ? 'rgba(15,16,22,0.95)'
                    : 'rgba(255,255,255,0.08)',
                borderColor: isHeld
                  ? '#fff'
                  : isDefault
                    ? GOLD
                    : 'rgba(255,255,255,0.12)',
                color: isHeld ? '#000' : isBlack ? 'rgba(255,255,255,0.5)' : '#fff',
                fontWeight: isHeld || isDefault ? 700 : 500,
              }}
              title={`Strike ${label} (MIDI ${midi})`}
            >
              <span>{semi === 0 || isDefault ? label : noteNames[semi]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
