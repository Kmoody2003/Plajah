// TONOS — world strings, simulated as strings. Pick a region and an instrument, start from a preset,
// shape it with six macros or the physical controls themselves, watch the live multi-course string
// wave, Weinreich dual-polarization bridge orbit, 3D-CT soundboard graduation & sympathetic tarafs
// respond in real time, and audition it on a two-octave keyboard.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTonosCadModel } from '../../../../services/melos/instruments/cad3d';
import { Instrument3DViewport } from './3d/Instrument3DViewport';
import { Split2D3DWorkspace } from './3d/Split2D3DWorkspace';
import { resolveTonosArchetype } from '../../../../services/melos/instruments/cad3d/performanceKinematics';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { TONOS_INSTRUMENTS, TONOS_REGIONS, type TonosInstrument, type TonosRegion } from '../../../../services/melos/instruments/tonos/catalog';
import { NOTE_NAMES, RV, TN, TONOS_INDEX_PARAMS, TONOS_PARAM_META, TONOS_SYMP_SCALES, type TonosParamMeta } from '../../../../services/melos/instruments/tonos/params';
import { TONOS_PRESETS, tonosPresetsForInstrument, tonosSubPresetLabel } from '../../../../services/melos/instruments/tonos/presets';
import { TonosDeepToggle } from './TonosDeepToggle';
import {
  TONOS_MACRO_LABELS, TONOS_MACRO_ORDER, applyTonosPatch, applyTonosPreset, deserializeTonosPatch, expandTonosMacros, newTonosPatch, serializeTonosPatch,
  type TonosMacro, type TonosPatch,
} from '../../../../services/melos/instruments/tonos/patch';
import { describeString } from '../../../../services/melos/instruments/tonos/physics';
import {
  HERITAGE_TONEWOODS,
  ageTonewood,
  evaluateCtPlateThicknessMm,
  simulateWeinreichPolarization,
  solveOrthotropicPlateModes,
  type PlateArchProfile,
  type TonewoodId,
} from '../../../../services/melos/instruments/physics/heritageAcoustics';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import { PANEL_SEAT_INTROS } from '../../../../services/melos/beats/band/live/lineAudio';
import { InstrumentBandSeat } from './InstrumentBandSeat';
import { useAuditionKeys } from './useInstrumentKeyboard';
import { FocusRange } from '../shared/FocusRange';

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

/** Semitone offsets per sympathetic scale index (mirrors SYMP_SCALES in tonos.rs). */
const SYMP_SCALE_STEPS: readonly (readonly number[])[] = [
  [0, 2, 4, 6, 7, 9, 11],       // Yaman
  [0, 2, 4, 5, 7, 9, 11],       // Bilawal (major)
  [0, 2, 3, 5, 7, 9, 10],       // Kafi (Dorian)
  [0, 1, 4, 5, 7, 8, 11],       // Bhairav
  [0, 1, 3, 6, 7, 8, 11],       // Todi
  [0, 1, 4, 5, 7, 8, 10],       // Hijaz
  [0, 3, 5, 7, 10],             // Pentatonic minor
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // Chromatic
  [0, 7, 12, 19],               // Fifths
];

function heritageProfileFor(inst: TonosInstrument): { woodId: TonewoodId; arch: PlateArchProfile } {
  if (inst.body === 'gourd') return { woodId: 'aged_gourd', arch: 'carved_tabli' };
  if (inst.region === 'south-asia') return { woodId: 'indian_tun', arch: 'carved_tabli' };
  if (inst.region === 'east-asia') return { woodId: 'kiri_paulownia', arch: 'hollowed_kiri' };
  if (inst.region === 'africa') return { woodId: inst.body === 'wood' ? 'lenke_hardwood' : 'aged_gourd', arch: 'carved_tabli' };
  if (inst.region === 'middle-east') return { woodId: 'torres_cedar', arch: 'torres_fan' };
  return { woodId: 'cremonese_spruce', arch: 'stradivari_titian' };
}

function tonosBandSeatFor(inst: TonosInstrument): { playerId: string; loreId: string; role: string } {
  if (inst.region === 'africa' && inst.excite !== 'bow') {
    return { playerId: 'amara', loreId: 'world-lutes-and-harps', role: 'Session Band West African strings · live' };
  }
  if (inst.excite === 'hammer' || /santur|santoor|yangqin|cimbalom|guzheng|koto|gayageum|kantele|qanun|đàn bầu|dan[\s-]?bau/i.test(inst.name)) {
    return { playerId: 'theo', loreId: 'world-zithers-dulcimers', role: 'Session Band zithers & dulcimers · live' };
  }
  if (/morin[\s-]?khuur|gusle/i.test(inst.name)) {
    return { playerId: 'ingrid', loreId: 'world-bowed-fiddles', role: 'Session Band bowed strings · live' };
  }
  if (inst.excite === 'bow' || inst.excite === 'wheel') {
    return { playerId: 'priya', loreId: 'world-bowed-fiddles', role: 'Session Band bowed strings · live' };
  }
  return { playerId: 'rosa', loreId: 'world-lutes-and-harps', role: 'Session Band plucked strings · live' };
}

/** Two octaves of keys starting at C of the patch's octave. */
const KEYS = Array.from({ length: 25 }, (_, i) => i);
const BLACK = new Set([1, 3, 6, 8, 10]);

export const TonosPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  // Read live patch every render — doc mutates in place on macro/MIDI edits.
  const patch: TonosPatch = deserializeTonosPatch(track.instrument?.patch) ?? newTonosPatch();
  const expanded = expandTonosMacros(patch.params, patch.macros);
  const instIndex = patch.instrument;
  const inst = TONOS_INSTRUMENTS[instIndex] ?? TONOS_INSTRUMENTS[0]!;
  const [region, setRegion] = useState<TonosRegion>(inst.region);
  const [octave, setOctave] = useState(() => Math.floor((patch.defaultNote ?? 60) / 12) - 1);
  const [lastNote, setLastNote] = useState<number>(patch.defaultNote ?? 60);
  const [strikeNonce, setStrikeNonce] = useState(0);
  const cadData = useMemo(() => buildTonosCadModel(inst, instIndex, expanded), [inst, instIndex, expanded]);
  const instPresets = useMemo(() => tonosPresetsForInstrument(instIndex), [instIndex]);
  const activeSubPreset = useMemo(() => instPresets.find((p) => p.id === patch.presetId), [instPresets, patch.presetId]);

  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strikeImpulseRef = useRef<{ time: number; vel: number }>({ time: 0, vel: 0.8 });
  const wakeSimRef = useRef<() => void>(() => {});

  useEffect(() => { setRegion(inst.region); }, [inst.region]);
  useEffect(() => {
    void BeatsEngine.get().ensureInstrument(track).then((engineInst) => { if (engineInst) applyTonosPatch(engineInst, patch); });
  }, [track, patch]);

  const pushTonosPatch = useCallback((next: TonosPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) {
      applyTonosPatch(inst, next);
      return;
    }
    const liveTrack = engine.getDoc().arrangement.find((x) => x.id === track.id) ?? track;
    void engine.ensureInstrument(liveTrack).then((created) => {
      if (created) applyTonosPatch(created, next);
    });
  }, [track]);

  const commit = useCallback((next: TonosPatch, rename?: string) => {
    pushTonosPatch(next);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t || !t.instrument) return;
      t.instrument.type = 'tonos';
      t.instrument.patch = serializeTonosPatch(next);
      if (rename) { t.instrument.presetName = rename; t.name = rename; syncPadWithTrack(d, track.id); }
    });
  }, [onMutate, pushTonosPatch, track.id]);

  const handleStrike = useCallback((n: number) => {
    setLastNote(n);
    strikeImpulseRef.current = { time: performance.now(), vel: 0.85 };
    wakeSimRef.current();
    setStrikeNonce((k) => k + 1);
  }, []);
  const { noteOn, noteOff, releaseAll, heldSize } = useAuditionKeys(track, handleStrike);

  const pickPreset = (p: (typeof TONOS_PRESETS)[number]) => {
    releaseAll(false);
    liveBus.emit({ kind: 'preset', instrument: 'tonos', trackId: track.id, at: liveNow(), presetId: p.id, presetName: p.name });
    commit(applyTonosPreset(patch, p), p.name);
    setOctave(Math.floor(p.defaultNote / 12) - 1);
    setLastNote(p.defaultNote);
  };
  const pickInstrument = (i: number) => {
    releaseAll(true);
    const first = TONOS_PRESETS.find((p) => p.instrument === i);
    if (first) pickPreset(first);
  };
  const setParam = (id: number, v: number) => {
    liveBus.emit({ kind: 'param', instrument: 'tonos', trackId: track.id, at: liveNow(), paramId: id });
    commit({ ...patch, params: { ...patch.params, [id]: v } });
  };
  const setMacro = (k: TonosMacro, v: number) => {
    liveBus.emit({ kind: 'param', instrument: 'tonos', trackId: track.id, at: liveNow(), paramId: TONOS_MACRO_ORDER.indexOf(k) });
    commit({ ...patch, macros: { ...patch.macros, [k]: v } });
  };

  // Precompute heritage 3D-CT thickness grid, orthotropic modes, and Weinreich polarization orbit
  const heritageData = useMemo(() => {
    const { woodId, arch } = heritageProfileFor(inst);
    const age = expanded[TN.HERITAGE_AGE] ?? 0.35;
    const craft = expanded[TN.CRAFT_ASYMMETRY] ?? 0.28;
    const bodySize = expanded[TN.BODY_SIZE] ?? 0.5;
    const baseSpec = HERITAGE_TONEWOODS[woodId];
    const agedSpec = ageTonewood(baseSpec, age, 0.5);
    const gridN = 18;
    const thicknessGrid: number[] = [];
    for (let gy = 0; gy < gridN; gy++) {
      const eta = (gy / (gridN - 1)) * 2 - 1;
      for (let gx = 0; gx < gridN; gx++) {
        const xi = (gx / (gridN - 1)) * 2 - 1;
        thicknessGrid.push(evaluateCtPlateThicknessMm(xi, eta, arch, craft));
      }
    }
    const fPlate = 195 * Math.pow(2, (0.5 - bodySize) * 0.65);
    const modes = solveOrthotropicPlateModes({
      woodId,
      fPlateBaseHz: fPlate,
      fHelmholtzHz: fPlate * 0.58,
      age,
      craftAsymmetry: craft,
      maxModes: 12,
      minFreqHz: 180,
      maxFreqHz: 4200,
    });
    const noteHz = 440 * Math.pow(2, (lastNote - 69) / 12);
    const orbit = simulateWeinreichPolarization({
      freqHz: Math.min(320, Math.max(85, noteHz)),
      pluckAngleRad: 0.42 + 0.55 * craft,
      bridgeCoupling: 0.25 + 0.65 * (expanded[TN.BODY] ?? 0.5),
      craftDetuneCents: 1.5 + 11.5 * craft,
      durationMs: 42,
      points: 96,
    });
    return { woodId, arch, baseSpec, agedSpec, gridN, thicknessGrid, modes, orbit };
  }, [inst, expanded, lastNote]);

  // Real-time 60 fps Multi-Course String, Weinreich Bridge Orbit & 3D-CT Soundboard / Taraf Canvas
  useEffect(() => {
    const canvas = simCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pcmBuf = new Float32Array(512);
    let freqBuf: Uint8Array | null = null;
    let prevPeak = 0;
    let raf = 0;
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const leftW = Math.floor(canvas.width * 0.45);
    const midW = Math.floor(canvas.width * 0.24);
    const rightX = leftW + midW;
    const rightW = canvas.width - rightX;
    const plateX = rightX + 12;
    const plateY = 24;
    const plateW = Math.max(44, Math.floor(rightW * 0.44));
    const plateH = canvas.height - 38;

    // Pre-render static backdrop, zone dividers, orbit reticle & 18x18 3D-CT thickness map once
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      const w = canvas.width;
      const h = canvas.height;
      bgCtx.fillStyle = '#09080D';
      bgCtx.fillRect(0, 0, w, h);
      bgCtx.strokeStyle = 'rgba(255,255,255,0.08)';
      bgCtx.lineWidth = 1;
      bgCtx.beginPath();
      bgCtx.moveTo(leftW, 8);
      bgCtx.lineTo(leftW, h - 8);
      bgCtx.moveTo(rightX, 8);
      bgCtx.lineTo(rightX, h - 8);
      bgCtx.stroke();

      const sLeft = 16;
      const sRight = leftW - 18;
      const bridgeX = sRight - 6;
      const jawariAmt = inst.jawari ? (expanded[TN.JAWARI] ?? 0.55) : 0;
      bgCtx.fillStyle = jawariAmt > 0.02 ? 'rgba(245, 158, 11, 0.28)' : 'rgba(201, 139, 74, 0.25)';
      bgCtx.strokeStyle = jawariAmt > 0.02 ? '#F59E0B' : ACCENT;
      bgCtx.lineWidth = 1.6;
      bgCtx.beginPath();
      if (inst.jawari) {
        bgCtx.ellipse(bridgeX - 4, h * 0.52, 8, h * 0.3, 0, 0, Math.PI * 2);
      } else {
        bgCtx.roundRect(bridgeX - 3, h * 0.2, 6, h * 0.64, 2);
      }
      bgCtx.fill();
      bgCtx.stroke();

      bgCtx.fillStyle = 'rgba(255,255,255,0.28)';
      bgCtx.fillRect(sLeft - 2, h * 0.22, 3, h * 0.6);

      const ocx = leftW + midW * 0.5;
      const ocy = h * 0.54;
      const oRad = Math.min(midW, h) * 0.32;
      bgCtx.strokeStyle = 'rgba(255,255,255,0.1)';
      bgCtx.beginPath();
      bgCtx.arc(ocx, ocy, oRad, 0, Math.PI * 2);
      bgCtx.moveTo(ocx - oRad, ocy);
      bgCtx.lineTo(ocx + oRad, ocy);
      bgCtx.moveTo(ocx, ocy - oRad);
      bgCtx.lineTo(ocx, ocy + oRad);
      bgCtx.stroke();

      const gn = heritageData.gridN;
      const cellW = plateW / gn;
      const cellH = plateH / gn;
      for (let gy = 0; gy < gn; gy++) {
        for (let gx = 0; gx < gn; gx++) {
          const xi = (gx / (gn - 1)) * 2 - 1;
          const eta = (gy / (gn - 1)) * 2 - 1;
          if (xi * xi * 1.15 + eta * eta * 0.88 > 1.05) continue;
          const th = heritageData.thicknessGrid[gy * gn + gx] ?? 2.8;
          const normT = Math.max(0, Math.min(1, (th - 1.5) / 4.5));
          const rCol = Math.round(90 + 145 * (1 - normT));
          const gCol = Math.round(52 + 88 * (1 - normT));
          const bCol = Math.round(28 + 40 * normT);
          bgCtx.fillStyle = `rgba(${rCol},${gCol},${bCol},0.82)`;
          bgCtx.fillRect(plateX + gx * cellW, plateY + gy * cellH, cellW + 0.6, cellH + 0.6);
        }
      }
    }

    const render = (now: number) => {
      if (disposed) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.drawImage(bgCanvas, 0, 0);

      const eng = BeatsEngine.get();
      const engineInst = eng.getInstrument(track.id);
      const peak = engineInst ? engineInst.readWaveform(pcmBuf) : 0;
      if (engineInst?.analyser) {
        if (!freqBuf || freqBuf.length !== engineInst.analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(engineInst.analyser.frequencyBinCount);
        }
        engineInst.analyser.getByteFrequencyData(freqBuf);
      }
      if (peak > 0.04 && peak > prevPeak * 1.38 && now - strikeImpulseRef.current.time > 45) {
        strikeImpulseRef.current = { time: now, vel: Math.min(1, peak * 1.45) };
        if (engineInst?.lastNote) setLastNote((prev) => (prev === engineInst.lastNote ? prev : engineInst.lastNote));
      }
      prevPeak = peak;

      const dtSec = Math.max(0, (now - strikeImpulseRef.current.time) * 0.001);
      const impulseEnv = Math.exp(-dtSec * (inst.excite === 'bow' || inst.excite === 'wheel' ? 1.8 : 3.2)) * strikeImpulseRef.current.vel;
      const energy = Math.min(1, Math.max(peak * 1.8, heldSize() > 0 ? Math.max(0.22, impulseEnv) : impulseEnv * 0.55));

      // ── ZONE 1: Multi-Course Physical Strings, Pluck/Bow Contact & Jawari / Rattle ──
      const courses = Math.max(1, Math.min(4, inst.courses));
      const posNorm = Math.max(0.06, Math.min(0.88, expanded[TN.POSITION] ?? 0.5));
      const jawariAmt = inst.jawari ? (expanded[TN.JAWARI] ?? 0.55) : 0;
      const rattleAmt = inst.rattle ? (expanded[TN.RATTLE] ?? 0.45) : 0;
      const detuneAmt = expanded[TN.COURSE_DETUNE] ?? 0.35;
      const sLeft = 16;
      const sRight = leftW - 18;
      const sLen = sRight - sLeft;
      const bridgeX = sRight - 6;
      const exciteX = bridgeX - posNorm * (sLen * 0.82);

      // Vibrating course strings
      for (let c = 0; c < courses; c++) {
        const yBase = courses === 1 ? h * 0.52 : h * (0.32 + (0.4 * c) / (courses - 1));
        const beatPhase = now * 0.012 * (1 + c * 0.14 * (0.4 + detuneAmt));
        ctx.beginPath();
        for (let px = 0; px <= 48; px++) {
          const u = px / 48;
          const x = sLeft + u * (bridgeX - sLeft);
          const stand1 = Math.sin(Math.PI * u) * Math.sin(beatPhase);
          const stand2 = Math.sin(2 * Math.PI * u) * Math.cos(beatPhase * 1.98) * (1 - posNorm) * 0.55;
          const pcmMod = pcmBuf[Math.min(pcmBuf.length - 1, px * 8)] ?? 0;
          const amp = energy * 11 * (stand1 * 0.7 + stand2 * 0.3 + pcmMod * 0.65 * Math.sin(Math.PI * u));
          const y = yBase + amp;
          if (px === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = c === 0 ? '#F3C892' : 'rgba(201, 139, 74, 0.72)';
        ctx.lineWidth = c === 0 ? 1.8 : 1.2;
        ctx.stroke();
      }

      // Excitation point marker (plectrum / bow / hammer)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(exciteX, h * 0.2);
      ctx.lineTo(exciteX, h * 0.84);
      ctx.stroke();
      ctx.setLineDash([]);

      // Jawari grazing sparks or Rattle clatter sparks
      if (jawariAmt > 0.04 && energy > 0.04) {
        const sparkR = 3 + energy * jawariAmt * 10;
        const g = ctx.createRadialGradient(bridgeX - 5, h * 0.52, 1, bridgeX - 5, h * 0.52, sparkR);
        g.addColorStop(0, 'rgba(253, 224, 71, 0.92)');
        g.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bridgeX - 5, h * 0.52, sparkR, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rattleAmt > 0.04 && energy > 0.06) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
        for (let rk = 0; rk < 4; rk++) {
          const jitter = Math.sin(now * 0.09 + rk * 2.1) * energy * rattleAmt * 6;
          ctx.beginPath();
          ctx.arc(bridgeX + 5, h * (0.34 + rk * 0.11) + jitter, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '9px monospace';
      ctx.fillText(
        `${courses}× course · pos ${Math.round(posNorm * 100)}%${inst.jawari ? ` · jawari ${Math.round(jawariAmt * 100)}%` : ''}${inst.rattle ? ` · ${inst.rattle}` : ''}`,
        12,
        16,
      );

      // ── ZONE 2: Weinreich Dual-Polarization Bridge Orbit (vx, vy) ──
      const ocx = leftW + midW * 0.5;
      const ocy = h * 0.54;
      const oRad = Math.min(midW, h) * 0.32;

      const rot = now * 0.0018 * (0.4 + (expanded[TN.CRAFT_ASYMMETRY] ?? 0.28) * 2.2);
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts = heritageData.orbit;
      const scaleO = oRad * (0.22 + 0.78 * energy);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const rx = p.vx * cosR - p.vy * sinR;
        const ry = p.vx * sinR + p.vy * cosR;
        const x = ocx + rx * scaleO;
        const y = ocy - ry * scaleO;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('WEINREICH ORBIT', leftW + 10, 16);
      ctx.fillStyle = 'rgba(56,189,248,0.75)';
      ctx.fillText(`2-plane Y_vh ${Math.round((expanded[TN.CRAFT_ASYMMETRY] ?? 0.28) * 100)}%`, leftW + 10, h - 8);

      // ── ZONE 3: 3D-CT Soundboard Glow Pulse + 13 Sympathetic Taraf Strings ──
      if (energy > 0.03) {
        ctx.fillStyle = `rgba(245, 190, 90, ${(energy * 0.22).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(plateX + plateW * 0.5, plateY + plateH * 0.5, plateW * 0.36, plateH * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 13 Sympathetic Taraf Strings on the right half of Zone 3
      const sympAmt = expanded[TN.SYMP] ?? 0;
      const sympKey = Math.round(expanded[TN.SYMP_KEY] ?? 0) % 12;
      const sympScaleIdx = Math.max(0, Math.min(SYMP_SCALE_STEPS.length - 1, Math.round(expanded[TN.SYMP_SCALE] ?? 0)));
      const scaleSteps = SYMP_SCALE_STEPS[sympScaleIdx]!;
      const tarafX0 = plateX + plateW + 12;
      const tarafX1 = w - 10;
      const sr = engineInst?.analyser?.context.sampleRate ?? 48000;
      const fftSize = engineInst?.analyser?.fftSize ?? 2048;

      for (let s = 0; s < 13; s++) {
        const ty = 26 + ((h - 42) * s) / 12;
        const oct = Math.floor(s / scaleSteps.length);
        const deg = scaleSteps[s % scaleSteps.length]!;
        const midiT = 60 + sympKey + oct * 12 + deg;
        const hzT = 440 * Math.pow(2, (midiT - 69) / 12);
        let mag = 0;
        if (freqBuf && sympAmt > 0.01) {
          const bin = Math.min(freqBuf.length - 1, Math.max(1, Math.round((hzT * fftSize) / sr)));
          mag = (freqBuf[bin]! / 255) * sympAmt;
        } else if (sympAmt > 0.01 && energy > 0.05 && ((lastNote - sympKey + 120) % 12) === (deg % 12)) {
          mag = energy * sympAmt * 0.85;
        }
        ctx.strokeStyle = mag > 0.32 ? 'rgba(253, 224, 71, 0.88)' : mag > 0.08 ? 'rgba(253, 224, 71, 0.45)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = mag > 0.08 ? 1.7 : 1;
        ctx.beginPath();
        const vibY = mag * Math.sin(now * 0.04 + s) * 2.2;
        ctx.moveTo(tarafX0, ty);
        ctx.quadraticCurveTo((tarafX0 + tarafX1) * 0.5, ty + vibY, tarafX1, ty);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`CT BODY · ${heritageData.baseSpec.label.slice(0, 18)}`, rightX + 10, 16);
      ctx.fillStyle = 'rgba(201,139,74,0.85)';
      ctx.fillText(
        sympAmt > 0.01 ? `Tarafs: ${NOTE_NAMES[sympKey]} ${TONOS_SYMP_SCALES[sympScaleIdx]?.split(' ')[0]}` : `E/ρ +${Math.round(((heritageData.agedSpec.eLong / heritageData.agedSpec.rho) / (heritageData.baseSpec.eLong / heritageData.baseSpec.rho) - 1) * 100)}% aged`,
        rightX + 10,
        h - 8,
      );

      if (energy > 0.01 || peak > 0.002 || heldSize() > 0 || eng.isRunning()) {
        raf = requestAnimationFrame(render);
      } else {
        raf = 0;
        if (!idleTimer) {
          idleTimer = setInterval(() => {
            const instNow = eng.getInstrument(track.id);
            const active = heldSize() > 0 || eng.isRunning() || (instNow ? instNow.readWaveform(pcmBuf) > 0.002 : false);
            if (active && !raf && !disposed) {
              if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
              raf = requestAnimationFrame(render);
            }
          }, 120);
        }
      }
    };

    wakeSimRef.current = () => {
      if (disposed) return;
      if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
      if (!raf) raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (idleTimer) clearInterval(idleTimer);
    };
  }, [expanded, heritageData, inst, lastNote, track.id, heldSize]);

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
  const stringLine = describeString(instIndex, lastNote, expanded[TN.TENSION] ?? 0.5, patch.params[TN.MATERIAL] ?? 0);

  const body = (
    <div className="flex flex-col gap-4 p-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: ACCENT }}>TONOS · world strings, physically modelled</p>
          <h2 className="text-lg font-black">{patch.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <TonosDeepToggle bowed={inst.excite === 'bow' || inst.excite === 'wheel'} />
          {!embedded && <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-white/10"><X size={16} /></button>}
        </div>
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

      <div className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] border border-white/10 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/55">
            {inst.name} Sub-Presets <span className="text-white/35">({instPresets.length})</span>
          </span>
          {activeSubPreset && (
            <span className="text-[10px] font-mono truncate max-w-[220px]" style={{ color: ACCENT }}>
              {tonosSubPresetLabel(activeSubPreset, inst.name)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${inst.name} sub-presets`}>
          {instPresets.map((p) => {
            const active = patch.presetId === p.id;
            const subLabel = tonosSubPresetLabel(p, inst.name);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                title={p.description}
                onClick={() => pickPreset(p)}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition"
                style={
                  active
                    ? { background: ACCENT, color: '#000', borderColor: 'transparent' }
                    : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.72)', background: 'rgba(255,255,255,0.03)' }
                }
              >
                {subLabel}
              </button>
            );
          })}
        </div>
        {(activeSubPreset?.description || patch.description) && (
          <p className="text-[10px] text-white/50 leading-snug">
            {activeSubPreset?.description ?? patch.description}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white/[0.04] border border-white/8 p-3 flex flex-col gap-1.5">
        <p className="text-[12px] text-white/80"><span className="font-black" style={{ color: ACCENT }}>{inst.name}</span> · {inst.origin} · {EXCITE_LABEL[inst.excite]}</p>
        <p className="text-[11px] text-white/55 leading-relaxed">{inst.about}</p>
        <p className="text-[10px] font-mono text-white/45" aria-live="polite">Note {lastNote}: {stringLine}</p>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed -mt-2">{HOW}</p>

      {/* 2D Multi-Physics String & Bridge Simulator (always visible alongside right 3D Viewport) */}
      <div className="rounded-xl border border-white/10 bg-black/50 p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            2D Physics · Weinreich Bridge & CT Soundboard
          </span>
          <span className="text-[10px] text-white/45 truncate max-w-[240px]">
            {cadData.spec.subtitle ?? inst.name}
          </span>
        </div>
        <canvas
          ref={simCanvasRef}
          width={520}
          height={150}
          className="w-full h-[150px] rounded-lg border border-white/[0.06]"
        />
        <div className="grid grid-cols-2 gap-3 px-1 pt-0.5">
          <label className="flex flex-col gap-0.5 text-[10px] text-white/65" title="Seasoned spruce/tun/kiri hemicellulose aging & Bridge-Hill bloom">
            <span className="flex justify-between"><span>Heritage Wood / Hide Age</span><span className="font-mono text-[#C98B4A]">{Math.round((patch.params[TN.HERITAGE_AGE] ?? 0.35) * 100)}%</span></span>
            <FocusRange label="Tonos Heritage Wood / Hide Age" focusId={`tonos:${track.id}:param:${TN.HERITAGE_AGE}`} trackId={track.id} accentColor={ACCENT} min={0} max={1} step={0.01} value={patch.params[TN.HERITAGE_AGE] ?? 0.35} onValueChange={(v) => setParam(TN.HERITAGE_AGE, v)} className="accent-[#C98B4A] h-1.5" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-white/65" title="Handmade luthier micro-asymmetry: Weinreich dual-polarization bridge coupling & longitudinal phantom partials">
            <span className="flex justify-between"><span>Handmade Craft Asymmetry</span><span className="font-mono text-sky-400">{Math.round((patch.params[TN.CRAFT_ASYMMETRY] ?? 0.28) * 100)}%</span></span>
            <FocusRange label="Tonos Craft Asymmetry" focusId={`tonos:${track.id}:param:${TN.CRAFT_ASYMMETRY}`} trackId={track.id} accentColor="#38BDF8" min={0} max={1} step={0.01} value={patch.params[TN.CRAFT_ASYMMETRY] ?? 0.28} onValueChange={(v) => setParam(TN.CRAFT_ASYMMETRY, v)} className="accent-sky-400 h-1.5" />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/40">Sub-Preset Select
        <select value={patch.presetId ?? ''} onChange={(e) => { const p = instPresets.find((x) => x.id === e.target.value); if (p) pickPreset(p); }}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] normal-case tracking-normal text-white">
          {instPresets.map((p) => <option key={p.id} value={p.id} className="bg-black">{tonosSubPresetLabel(p, inst.name)} — {p.name}</option>)}
        </select>
      </label>
      {patch.description && <p className="text-[11px] text-white/45 -mt-2">{patch.description}</p>}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {TONOS_MACRO_ORDER.map((k) => (
          <label key={k} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/8 p-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{TONOS_MACRO_LABELS[k]}</span>
            <FocusRange
              label={`Tonos ${TONOS_MACRO_LABELS[k]}`}
              focusId={`tonos:${track.id}:macro:${k}`}
              trackId={track.id}
              accentColor={ACCENT}
              min={0}
              max={1}
              step={0.01}
              value={patch.macros[k]}
              onValueChange={(val) => setMacro(k, val)}
              className="w-full accent-[#C98B4A]"
              aria-label={TONOS_MACRO_LABELS[k]}
            />
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
                const eff = expanded[c.id] ?? v;
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
                const macroDelta = Math.abs(eff - v) >= 0.015;
                return (
                  <label key={c.id} className="flex flex-col gap-0.5" title={c.hint}>
                    <span className="flex justify-between text-[11px] text-white/70">
                      <span>{c.label}</span>
                      <span className="text-white/35">
                        {Math.round(v * 100)}%{macroDelta ? ` (${Math.round(eff * 100)}%)` : ''}
                      </span>
                    </span>
                    <FocusRange
                      label={`Tonos ${c.label}`}
                      focusId={`tonos:${track.id}:param:${c.id}`}
                      trackId={track.id}
                      accentColor={ACCENT}
                      min={0}
                      max={1}
                      step={0.01}
                      value={v}
                      onValueChange={(val) => setParam(c.id, val)}
                      className="w-full accent-[#C98B4A]"
                      aria-label={c.label}
                    />
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
            <span className="ml-2">Room {Math.round((expanded[RV.MIX] ?? 0.2) * 100)}%</span>
          </div>
        </div>
        <div className="flex h-20 select-none touch-none">
          {KEYS.map((k) => {
            const n = (octave + 1) * 12 + k;
            const black = BLACK.has(k % 12);
            return (
              <button key={k} aria-label={`Note ${n}`}
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); noteOn(n); }}
                onPointerUp={() => noteOff(n)} onPointerCancel={() => noteOff(n)} onLostPointerCapture={() => noteOff(n)} onPointerLeave={() => noteOff(n)}
                className={black ? 'w-[3%] -mx-[1.5%] z-10 h-[62%] bg-black border border-white/20 rounded-b' : 'flex-1 bg-white/90 hover:bg-white border border-black/30 rounded-b'} />
            );
          })}
        </div>
      </div>

      {(() => {
        const bandSeat = tonosBandSeatFor(inst);
        return (
          <InstrumentBandSeat
            instrument="tonos"
            playerId={bandSeat.playerId}
            loreId={bandSeat.loreId}
            role={bandSeat.role}
            intro={PANEL_SEAT_INTROS.tonos}
            screenText={`${inst.name} (${inst.origin}) · ${inst.excite} excitation · ${inst.body} body · ${inst.courses} course${inst.courses > 1 ? 's' : ''}${inst.jawari ? ' · jawari bridge' : ''}${inst.sympathetic > 0 ? ` · ${inst.sympathetic} sympathetic` : ''}`}
            accent={ACCENT}
            track={track}
            presetName={track.instrument?.presetName ?? inst.name}
            defaultNote={patch.defaultNote ?? 60}
          />
        );
      })()}
    </div>
  );

  const workspace = (
    <Split2D3DWorkspace
      trackId={track.id}
      accentHex={ACCENT}
      title3D="3D CAD · Physical String Model"
      subtitle3D={`${inst.name} · ${inst.origin}`}
      left={body}
      right3D={
        <Instrument3DViewport
          fillHeight
          model={cadData.model}
          spec={cadData.spec}
          trackId={track.id}
          strikeNonce={strikeNonce}
          sustained={inst.excite === 'bow' || inst.excite === 'wheel'}
          heldCount={heldSize}
          subtitle={inst.origin}
          kinematicsMeta={{
            archetype: resolveTonosArchetype(inst.excite),
            excitePos: patch.params[TN.POSITION] ?? 0.45,
          }}
          onTrigger={() => {
            noteOn(lastNote);
            window.setTimeout(() => noteOff(lastNote), 240);
          }}
        />
      }
    />
  );

  if (embedded) return workspace;
  return (
    <div className="fixed inset-y-0 right-0 z-[1200] w-full max-w-[1040px] flex flex-col bg-[#0d0a12] border-l border-white/10 shadow-2xl">{workspace}</div>
  );
};
