// LYRA — the physical-model instruments panel: pick the instrument (guitar, piano, violin, sax,
// trumpet, tine piano, flute, clarinet, double reeds, brass, plucked strings) and its variant,
// watch its live model-adaptive physical simulation (coupled trichord strings & sympathetic harp,
// Cremonese Helmholtz bowed string & 3D-CT soundboard, conical/cylindrical bore standing waves &
// cuivré shock steepening, or magnetic pickup flux + MNA Bode curve) respond in real time, shape
// it with six macros + heritage craft controls, and audition it on a two-octave keyboard.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLyraCadModel } from '../../../../services/melos/instruments/cad3d';
import { Instrument3DViewport } from './3d/Instrument3DViewport';
import { Split2D3DWorkspace } from './3d/Split2D3DWorkspace';
import { resolveLyraArchetype } from '../../../../services/melos/instruments/cad3d/performanceKinematics';
import { X } from 'lucide-react';
import type { ArrangeTrack, GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { syncPadWithTrack } from '../../../../services/melos/beats/instrumentFactory';
import { LY, LYRA_INDEX_PARAMS, LYRA_MODELS, LYRA_MODEL_LABELS, LYRA_PARAM_META, LYRA_PICKUPS_HUMBUCKER, LYRA_VARIANTS, RV, isElectric, type LyraModel } from '../../../../services/melos/instruments/lyra/params';
import { LYRA_PRESETS, lyraPresetsForModel } from '../../../../services/melos/instruments/lyra/presets';
import {
  LYRA_MACRO_LABELS, LYRA_MACRO_ORDER, applyLyraPatch, applyLyraPreset, deserializeLyraPatch, expandLyraMacros, newLyraPatch, serializeLyraPatch,
  type LyraMacro, type LyraPatch,
} from '../../../../services/melos/instruments/lyra/patch';
import {
  HERITAGE_PICKUP_CIRCUITS,
  evaluateCtPlateThicknessMm,
  evaluatePickupBodeCurve,
  type PickupCircuitKind,
  type PlateArchProfile,
} from '../../../../services/melos/instruments/physics/heritageAcoustics';
import { liveBus, now as liveNow } from '../../../../services/melos/beats/band/live/events';
import { LyraBandSeat } from './LyraBandSeat';
import { useAuditionKeys } from './useInstrumentKeyboard';
import { FocusRange } from '../shared/FocusRange';

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
  guitar: 'A plucked string: a burst at the pick point travels down a tuned delay loop that loses highs each trip; the body colours it. The electric is a whole rig: pickups that hear the string at their place on it, pedals, a tube preamp, the amp\'s real tone-stack circuit, power tubes that sag, and a miked cabinet.',
  piano: 'A felt hammer and the soundboard\'s knock excite one to three strings per note, slightly detuned — their beating is the piano\'s two-stage decay. Stiff strings bend the overtones sharp.',
  violin: 'A bowed string: the rosined bow grips and slips (stick-slip friction) at the bow point, and the body — violin, viola, cello or double bass, each with its own air and wood modes — radiates it. The quartet hands each note to the instrument that plays that register.',
  sax: 'A reed beating against the mouthpiece drives a conical bore; breath noise, vibrato and growl come from the player.',
  trumpet: 'Buzzing lips drive the brass bore and the bell radiates the highs; mutes reshape the bell. Louder playing steepens the wave — brighter, not just louder.',
  flute: 'An air jet across the embouchure hole flips in and out of the tube and the bore locks it to a pitch. Blow harder and the bell opens up; the chiff is the jet finding the note.',
  clarinet: 'A single reed on a cylinder closed at the mouthpiece: in the low register only odd harmonics sound, which is the hollow chalumeau. Louder playing beats the reed shut each cycle and brightens it.',
  reed: 'Two blades of cane beating against each other on a conical bore, with the strong formants that make an oboe nasal and a bassoon woody.',
  brass: 'The trumpet\'s buzzing-lip model rescaled for the rest of the section. The bore and bell set each one apart: the flugelhorn\'s wide cone is mellow, the French horn\'s bell faces away with a hand in it, the trombone\'s long cylinder steepens the wave into a blaze at ff, and the tuba is huge and dark.',
  pluck: 'Plucked strings on the same string loop as the guitar, with their own strings, plucks and bodies: the harp\'s soundboard, the mandolin\'s paired courses, the banjo\'s drum head, the ukulele\'s little box, pizzicato on a violin-family body.',
  tine: 'Our tine electric piano: a neoprene hammer strikes a tine and its tonebar; a magnetic pickup reads the tine\'s motion through a nonlinear flux curve — the bark — into a preamp and stereo tremolo.',
};

const WIND_MODELS = new Set<LyraModel>(['sax', 'trumpet', 'flute', 'clarinet', 'reed', 'brass']);

/** Two octaves of keys starting at C of the patch's octave. */
const KEYS = Array.from({ length: 25 }, (_, i) => i);
const BLACK = new Set([1, 3, 6, 8, 10]);

export const LyraPanel: React.FC<Props> = ({ track, onMutate, onClose, embedded }) => {
  // Read live patch every render — doc mutates in place on macro/MIDI edits.
  const patch: LyraPatch = deserializeLyraPatch(track.instrument?.patch) ?? newLyraPatch();
  const expanded = expandLyraMacros(patch.params, patch.macros);
  const model = patch.model;
  const variant = Math.round(patch.params[LY.VARIANT] ?? 0);
  const [octave, setOctave] = useState(() => Math.floor((patch.defaultNote ?? 60) / 12) - 1);
  const [lastNote, setLastNote] = useState<number>(patch.defaultNote ?? 60);
  const [strikeNonce, setStrikeNonce] = useState(0);
  const cadData = useMemo(() => buildLyraCadModel(model, variant, expanded), [model, variant, expanded]);

  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strikeImpulseRef = useRef<{ time: number; vel: number }>({ time: 0, vel: 0.8 });
  const wakeSimRef = useRef<() => void>(() => {});

  useEffect(() => {
    void BeatsEngine.get().ensureInstrument(track).then((inst) => { if (inst) applyLyraPatch(inst, patch); });
  }, [track, patch]);

  const pushLyraPatch = useCallback((next: LyraPatch) => {
    const engine = BeatsEngine.get();
    const inst = engine.getInstrument(track.id);
    if (inst) {
      applyLyraPatch(inst, next);
      return;
    }
    const liveTrack = engine.getDoc().arrangement.find((x) => x.id === track.id) ?? track;
    void engine.ensureInstrument(liveTrack).then((created) => {
      if (created) applyLyraPatch(created, next);
    });
  }, [track]);

  const commit = useCallback((next: LyraPatch, rename?: string) => {
    pushLyraPatch(next);
    onMutate((d) => {
      const t = d.arrangement.find((x) => x.id === track.id);
      if (!t || !t.instrument) return;
      t.instrument.type = 'lyra';
      t.instrument.patch = serializeLyraPatch(next);
      if (rename) { t.instrument.presetName = rename; t.name = rename; syncPadWithTrack(d, track.id); }
    });
  }, [onMutate, pushLyraPatch, track.id]);

  const handleStrike = useCallback((n?: number) => {
    if (typeof n === 'number') setLastNote(n);
    strikeImpulseRef.current = { time: performance.now(), vel: 0.85 };
    wakeSimRef.current();
    setStrikeNonce((k) => k + 1);
  }, []);
  const { noteOn, noteOff, releaseAll, heldSize } = useAuditionKeys(track, handleStrike);

  const pickModel = (m: LyraModel) => {
    releaseAll(true);
    const first = LYRA_PRESETS.find((p) => p.model === m);
    if (first) { pickPreset(first); setOctave(Math.floor(first.defaultNote / 12) - 1); }
  };
  const setParam = (id: number, v: number) => {
    liveBus.emit({ kind: 'param', instrument: 'lyra', trackId: track.id, at: liveNow(), paramId: id });
    commit({ ...patch, params: { ...patch.params, [id]: v } });
  };
  const pickPreset = (p: (typeof LYRA_PRESETS)[number]) => {
    releaseAll(false);
    liveBus.emit({ kind: 'preset', instrument: 'lyra', trackId: track.id, at: liveNow(), presetId: p.id, presetName: p.name });
    commit(applyLyraPreset(patch, p), p.name);
  };
  const setMacro = (k: LyraMacro, v: number) => {
    liveBus.emit({ kind: 'param', instrument: 'lyra', trackId: track.id, at: liveNow(), paramId: LYRA_MACRO_ORDER.indexOf(k) });
    commit({ ...patch, macros: { ...patch.macros, [k]: v } });
  };

  const electric = isElectric(model, variant);
  const electroMag = electric || model === 'tine';

  // Precompute model-specific physical telemetry (MNA pickup Bode curve or 3D-CT Cremonese/Torres plate map)
  const simMeta = useMemo(() => {
    const age = expanded[LY.HERITAGE_AGE] ?? 0.35;
    const craft = expanded[LY.CRAFT_CHARACTER] ?? 0.3;
    const pickupPos = expanded[LY.PICKUP] ?? 0.5;
    const isCoilSplit = variant === 3 && (Math.abs(pickupPos - 0.25) < 0.13 || Math.abs(pickupPos - 0.75) < 0.13);
    const kind: PickupCircuitKind =
      model === 'tine'
        ? 'rhodes_tine'
        : variant === 3 && !isCoilSplit
          ? 'paf_humbucker'
          : 'single_alnico';
    const bode = electroMag
      ? evaluatePickupBodeCurve({
          kind,
          toneKnob: expanded[LY.TONE] ?? 0.65,
          pickupPosNorm: model === 'tine' ? (expanded[LY.EXCITE_POS] ?? 0.5) : (1 - pickupPos),
          age,
          points: 60,
        })
      : null;

    const arch: PlateArchProfile =
      model === 'violin'
        ? (craft > 0.55 ? 'guarneri_cannone' : 'stradivari_titian')
        : model === 'guitar' || model === 'pluck'
          ? 'torres_fan'
          : 'stradivari_titian';
    const gridN = 16;
    const plateGrid: number[] = [];
    if (!electroMag && !WIND_MODELS.has(model)) {
      for (let gy = 0; gy < gridN; gy++) {
        const eta = (gy / (gridN - 1)) * 2 - 1;
        for (let gx = 0; gx < gridN; gx++) {
          const xi = (gx / (gridN - 1)) * 2 - 1;
          plateGrid.push(evaluateCtPlateThicknessMm(xi, eta, arch, craft));
        }
      }
    }
    return { kind, bode, arch, gridN, plateGrid };
  }, [electroMag, expanded, model, variant]);

  // Live 60 fps Model-Adaptive Heritage Physical Simulation Canvas
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

    const splitX = Math.floor(canvas.width * 0.52);
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
      bgCtx.moveTo(splitX, 8);
      bgCtx.lineTo(splitX, h - 8);
      bgCtx.stroke();
      if (model === 'violin') {
        const gn = simMeta.gridN;
        const px0 = splitX + 18;
        const pw = Math.min(110, w - px0 - 95);
        const ph = h - 38;
        const cw = pw / gn;
        const ch = ph / gn;
        for (let gy = 0; gy < gn; gy++) {
          for (let gx = 0; gx < gn; gx++) {
            const xi = (gx / (gn - 1)) * 2 - 1;
            const eta = (gy / (gn - 1)) * 2 - 1;
            if (xi * xi * 1.18 + eta * eta * 0.85 > 1.05) continue;
            const th = simMeta.plateGrid[gy * gn + gx] ?? 2.8;
            const normT = Math.max(0, Math.min(1, (th - 1.8) / 2.4));
            bgCtx.fillStyle = `rgba(${Math.round(115 + 120 * (1 - normT))},${Math.round(68 + 90 * (1 - normT))},${Math.round(28 + 38 * normT)},0.86)`;
            bgCtx.fillRect(px0 + gx * cw, 24 + gy * ch, cw + 0.6, ch + 0.6);
          }
        }
      }
    }

    const render = (now: number) => {
      if (disposed) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.drawImage(bgCanvas, 0, 0);

      const eng = BeatsEngine.get();
      const inst = eng.getInstrument(track.id);
      const peak = inst ? inst.readWaveform(pcmBuf) : 0;
      if (inst?.analyser) {
        if (!freqBuf || freqBuf.length !== inst.analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(inst.analyser.frequencyBinCount);
        }
        inst.analyser.getByteFrequencyData(freqBuf);
      }
      if (peak > 0.04 && peak > prevPeak * 1.38 && now - strikeImpulseRef.current.time > 45) {
        strikeImpulseRef.current = { time: now, vel: Math.min(1, peak * 1.45) };
      }
      prevPeak = peak;

      const dtSec = Math.max(0, (now - strikeImpulseRef.current.time) * 0.001);
      const sustained = model === 'violin' || WIND_MODELS.has(model);
      const impulseEnv = Math.exp(-dtSec * (sustained ? 1.5 : 2.8)) * strikeImpulseRef.current.vel;
      const energy = Math.min(1, Math.max(peak * 1.85, heldSize() > 0 ? Math.max(0.28, impulseEnv) : impulseEnv * 0.5));

      ctx.font = '9px monospace';

      if (electroMag && simMeta.bode) {
        // ── MODE D: Tine / Electric Guitar Magnetic Flux + Live MNA Pickup Bode Curve ──
        const barkPos = expanded[LY.EXCITE_POS] ?? 0.5;
        const craft = expanded[LY.CRAFT_CHARACTER] ?? 0.3;

        // Pole piece & flux lines on left
        const poleX = splitX - 38;
        const poleY = h * 0.52 - (barkPos - 0.5) * 18;
        for (let fl = 1; fl <= 4; fl++) {
          ctx.strokeStyle = `rgba(56, 189, 248, ${(0.1 + 0.12 * (5 - fl) * (0.4 + energy * 0.6)).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(poleX, poleY, fl * 11, fl * 7, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(poleX - 6, poleY - 9, 14, 18);
        ctx.strokeStyle = ACCENT;
        ctx.strokeRect(poleX - 10, poleY - 12, 8, 24);

        // Vibrating tine (+ tonebar) or electric string
        const sX0 = 18;
        const sX1 = poleX - 14;
        if (model === 'tine') {
          // Tonebar above tine
          ctx.strokeStyle = 'rgba(217, 179, 108, 0.55)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(sX0, h * 0.34);
          ctx.lineTo(sX1 - 8, h * 0.34 + Math.sin(now * 0.018) * energy * 3.5);
          ctx.stroke();
        }
        ctx.beginPath();
        for (let px = 0; px <= 44; px++) {
          const u = px / 44;
          const x = sX0 + u * (sX1 - sX0);
          const modeShape = model === 'tine' ? u * u : Math.sin(Math.PI * u);
          const asymHarm = Math.sin(now * 0.044) + 0.35 * craft * Math.cos(now * 0.088);
          const y = h * 0.54 + modeShape * asymHarm * energy * 13;
          if (px === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(model === 'tine' ? 'TINE + TONEBAR FLUX' : 'MAGNETIC STRING APERTURE', 12, 16);
        ctx.fillStyle = 'rgba(217,179,108,0.85)';
        ctx.fillText(HERITAGE_PICKUP_CIRCUITS[simMeta.kind].label.slice(0, 34), 12, h - 8);

        // Right half: Live MNA RLC + Eddy + Tone-Pot + Cable Bode Plot + FFT overlay
        const bx0 = splitX + 14;
        const bw = w - bx0 - 12;
        const by0 = 24;
        const bh = h - 42;

        // Live FFT background bars (50 Hz .. 12 kHz log mapped)
        if (freqBuf && inst?.analyser) {
          const sr = inst.analyser.context.sampleRate || 48000;
          const fftN = inst.analyser.fftSize;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
          for (let i = 0; i < simMeta.bode.curve.length; i++) {
            const f = simMeta.bode.curve[i]!.freqHz;
            const bin = Math.min(freqBuf.length - 1, Math.max(1, Math.round((f * fftN) / sr)));
            const mag = freqBuf[bin]! / 255;
            const x = bx0 + (i / (simMeta.bode.curve.length - 1)) * bw;
            ctx.fillRect(x, by0 + bh * (1 - mag), Math.max(2, bw / 56), bh * mag);
          }
        }

        // Bode curve (-24 dB .. +14 dB)
        ctx.beginPath();
        simMeta.bode.curve.forEach((pt, idx) => {
          const x = bx0 + (idx / (simMeta.bode!.curve.length - 1)) * bw;
          const normDb = Math.max(0, Math.min(1, (pt.magDb + 24) / 38));
          const y = by0 + bh * (1 - normDb);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('MNA PICKUP + TONE + CABLE BODE', bx0, 16);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(
          `f_res ${(simMeta.bode.resonantFreqHz / 1000).toFixed(2)} kHz (${simMeta.bode.resonantPeakDb >= 0 ? '+' : ''}${simMeta.bode.resonantPeakDb.toFixed(1)} dB)`,
          bx0,
          h - 8,
        );
      } else if (model === 'violin') {
        // ── MODE B: Cremonese Helmholtz Bowed String + 3D-CT Plate & Rosin Hysteresis ──
        const sX0 = 16;
        const sX1 = splitX - 16;
        const bowPos = Math.max(0.08, Math.min(0.45, 0.08 + 0.35 * (expanded[LY.EXCITE_POS] ?? 0.3)));
        const cornerPhase = (now * 0.0042) % 1;
        const cornerU = cornerPhase < 0.5 ? cornerPhase * 2 : 2 - cornerPhase * 2;

        // Sharp Helmholtz stick-slip corner wave
        ctx.beginPath();
        for (let px = 0; px <= 48; px++) {
          const u = px / 48;
          const x = sX0 + u * (sX1 - sX0);
          const tri = u <= cornerU
            ? (u / Math.max(0.02, cornerU)) * (1 - cornerU)
            : ((1 - u) / Math.max(0.02, 1 - cornerU)) * cornerU;
          const envSign = cornerPhase < 0.5 ? 1 : -1;
          const y = h * 0.46 + envSign * (tri * 4 - 0.6) * energy * 11;
          if (px === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 1.9;
        ctx.stroke();

        // Bow hair contact marker + thermal rosin loop inset
        const bowX = sX1 - bowPos * (sX1 - sX0);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bowX, h * 0.2);
        ctx.lineTo(bowX + Math.sin(now * 0.008) * energy * 6, h * 0.72);
        ctx.stroke();

        // Thermal rosin hysteresis ellipse at bottom-left
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(sX0 + 46, h * 0.77, 34, 9 * (0.35 + energy * 0.65), -0.18, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('HELMHOLTZ STICK-SLIP WAVE', 12, 16);
        ctx.fillStyle = 'rgba(56,189,248,0.8)';
        ctx.fillText('Smith-Woodhouse thermal rosin', 96, h - 8);

        // Right half: 3D-CT Cremonese Stradivari / Guarneri Bridge-Hill glow (grid pre-rendered offscreen)
        const px0 = splitX + 18;
        const pw = Math.min(110, w - px0 - 95);
        const ph = h - 38;
        const age = expanded[LY.HERITAGE_AGE] ?? 0.35;
        if (energy > 0.025) {
          ctx.fillStyle = `rgba(245, 190, 95, ${(energy * (0.14 + 0.18 * age)).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(px0 + pw * 0.5, 24 + ph * 0.5, pw * 0.38, ph * 0.36, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(simMeta.arch === 'guarneri_cannone' ? '1734 GUARNERI CT MAP' : '1715 STRADIVARI CT MAP', splitX + 14, 16);
        ctx.fillStyle = ACCENT;
        ctx.fillText(`Bridge Hill 2.3kHz · +${Math.round(age * 100)}% age`, splitX + 14, h - 8);
      } else if (WIND_MODELS.has(model)) {
        // ── MODE C: Conical / Cylindrical Bore Standing-Wave Pressure + Reed/Lip + Cuivré ──
        const bX0 = 26;
        const bX1 = splitX - 18;
        const bMidY = h * 0.52;
        const conical = model === 'sax' || model === 'reed' || model === 'brass' || model === 'trumpet';
        const oddOnly = model === 'clarinet';
        const drive = expanded[LY.DRIVE] ?? 0.25;

        // Bore standing-wave pressure heat slices
        const slices = 38;
        for (let s = 0; s < slices; s++) {
          const u = s / (slices - 1);
          const x = bX0 + u * (bX1 - bX0);
          const halfH = conical ? 7 + Math.pow(u, 1.9) * 28 : 13 + (u > 0.86 ? (u - 0.86) * 65 : 0);
          const pWave =
            Math.cos(Math.PI * 0.5 * u * (oddOnly ? 3 : 2)) * Math.sin(now * 0.03) +
            drive * 0.45 * Math.cos(Math.PI * u * 3) * Math.sin(now * 0.06);
          const pNorm = pWave * energy;
          ctx.fillStyle = pNorm >= 0
            ? `rgba(245, 158, 11, ${(0.12 + Math.min(0.75, pNorm * 0.7)).toFixed(2)})`
            : `rgba(56, 189, 248, ${(0.12 + Math.min(0.75, -pNorm * 0.7)).toFixed(2)})`;
          ctx.fillRect(x, bMidY - halfH, (bX1 - bX0) / slices + 1, halfH * 2);
        }

        // Bore walls + trumpet mute indicator
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let sign of [-1, 1]) {
          for (let s = 0; s <= slices; s++) {
            const u = s / slices;
            const x = bX0 + u * (bX1 - bX0);
            const halfH = conical ? 7 + Math.pow(u, 1.9) * 28 : 13 + (u > 0.86 ? (u - 0.86) * 65 : 0);
            if (s === 0) ctx.moveTo(x, bMidY + sign * halfH);
            else ctx.lineTo(x, bMidY + sign * halfH);
          }
        }
        ctx.stroke();

        if (model === 'trumpet' && variant > 0) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
          ctx.beginPath();
          ctx.ellipse(bX1 + 2, bMidY, 7, 18, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Vibrating reed / lip aperture at left
        const gap = Math.max(1.5, 5 + Math.sin(now * 0.055) * energy * 4.2);
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bX0 - 12, bMidY - gap);
        ctx.lineTo(bX0, bMidY - 2);
        ctx.moveTo(bX0 - 12, bMidY + gap);
        ctx.lineTo(bX0, bMidY + 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(oddOnly ? 'CYLINDRICAL BORE (ODD MODES)' : 'CONICAL / FLARED BORE WAVE', 12, 16);
        ctx.fillStyle = ACCENT;
        ctx.fillText(`Breath / Embouchure ${Math.round((expanded[LY.EXCITE_HARD] ?? 0.5) * 100)}%`, 12, h - 8);

        // Right half: Live Waveform + Nonlinear Cuivré Steepening / Formant Spectrum
        const rx0 = splitX + 14;
        const rw = w - rx0 - 12;
        ctx.beginPath();
        for (let i = 0; i < 64; i++) {
          const u = i / 63;
          const rawS = pcmBuf[i * 4] ?? (Math.sin(u * Math.PI * 4 + now * 0.02) * energy * 0.5);
          // Show shock steepening shape blended with real PCM
          const steep = Math.tanh((rawS + drive * 0.4 * Math.sin(u * Math.PI * 8)) * (1.2 + drive * 2.2));
          const x = rx0 + u * rw;
          const y = h * 0.52 - steep * (h * 0.28);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = drive > 0.45 ? '#F59E0B' : '#38BDF8';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('NONLINEAR WAVE STEEPENING', rx0, 16);
        ctx.fillStyle = drive > 0.45 ? '#F59E0B' : '#38BDF8';
        ctx.fillText(`Cuivré / Growl ${Math.round(drive * 100)}%`, rx0, h - 8);
      } else {
        // ── MODE A: Piano / Acoustic Guitar / Harp — Coupled Unison Courses + Sympathetic Harp ──
        const sX0 = 16;
        const sX1 = splitX - 16;
        const unisonCount = model === 'piano' ? 3 : model === 'pluck' && variant === 1 ? 2 : 1;
        const detune = expanded[LY.DETUNE] ?? 0.35;
        const strikeU = Math.max(0.08, Math.min(0.5, expanded[LY.EXCITE_POS] ?? 0.18));

        for (let uIdx = 0; uIdx < unisonCount; uIdx++) {
          const y0 = unisonCount === 1 ? h * 0.52 : h * (0.36 + (0.32 * uIdx) / (unisonCount - 1));
          const ph = now * 0.015 * (1 + (uIdx - 1) * 0.045 * (0.3 + detune));
          ctx.beginPath();
          for (let px = 0; px <= 44; px++) {
            const u = px / 44;
            const x = sX0 + u * (sX1 - sX0);
            const w1 = Math.sin(Math.PI * u) * Math.sin(ph);
            const w2 = Math.sin(2 * Math.PI * u) * Math.cos(ph * 2.01) * 0.4;
            const y = y0 + (w1 + w2) * energy * 10;
            if (px === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = uIdx === 1 ? '#FDE68A' : ACCENT;
          ctx.lineWidth = uIdx === 1 ? 1.8 : 1.3;
          ctx.stroke();
        }

        // Felt hammer / plectrum impact indicator
        const hx = sX0 + strikeU * (sX1 - sX0);
        const hBounce = Math.max(0, 1 - dtSec * 12) * 10;
        ctx.fillStyle = model === 'piano' ? '#F59E0B' : '#38BDF8';
        ctx.beginPath();
        ctx.roundRect(hx - 5, h * 0.72 - hBounce, 10, 12, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(model === 'piano' ? 'TRICHORD UNISON + FELT HAMMER' : 'COUPLED STRING + PLUCK POINT', 12, 16);
        ctx.fillStyle = ACCENT;
        ctx.fillText(`Aged felt/wood ${Math.round((expanded[LY.HERITAGE_AGE] ?? 0.35) * 100)}%`, 12, h - 8);

        // Right half: 12-Bar Sympathetic Harp / Duplex Scale Resonance + Soundboard Glow
        const symp = Math.max(expanded[LY.SYMPATHETIC] ?? 0.3, (expanded[LY.PEDAL] ?? 0) > 0.5 ? 0.7 : 0);
        const rx0 = splitX + 16;
        const rw = w - rx0 - 14;
        for (let b = 0; b < 12; b++) {
          const bx = rx0 + (b / 12) * rw;
          const barW = Math.max(4, rw / 16);
          const fBar = 110 * Math.pow(2, b / 3);
          let mag = energy * symp * (0.25 + 0.55 * Math.abs(Math.sin(now * 0.004 + b)));
          if (freqBuf && inst?.analyser) {
            const bin = Math.min(freqBuf.length - 1, Math.max(1, Math.round((fBar * inst.analyser.fftSize) / (inst.analyser.context.sampleRate || 48000))));
            mag = Math.max(mag * 0.5, (freqBuf[bin]! / 255) * (0.35 + 0.65 * symp));
          }
          const barH = Math.max(5, Math.min(h - 46, mag * (h - 44)));
          ctx.fillStyle = mag > 0.18 ? 'rgba(217, 179, 108, 0.85)' : 'rgba(255,255,255,0.14)';
          ctx.fillRect(bx, h - 22 - barH, barW, barH);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('SYMPATHETIC HARP & DUPLEX', rx0, 16);
        ctx.fillStyle = '#38BDF8';
        ctx.fillText(`Resonance ${Math.round(symp * 100)}%${(expanded[LY.PEDAL] ?? 0) > 0.5 ? ' · Damper Up' : ''}`, rx0, h - 8);
      }

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
  }, [electroMag, expanded, heldSize, model, simMeta, track.id, variant]);

  const controls = LYRA_PARAM_META.filter((m) => (!m.models || m.models.includes(model)) && (!m.electric || electric));
  const groups: { id: (typeof controls)[number]['group']; label: string }[] = [
    { id: 'tone', label: 'Tone' }, { id: 'touch', label: 'Touch' }, { id: 'body', label: 'Body' }, { id: 'expression', label: 'Expression' }, { id: 'amp', label: 'Amp' }, { id: 'pedals', label: 'Pedals' },
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

      {/* 2D Heritage Physical Simulation (always visible alongside right 3D Viewport) */}
      <div className="rounded-xl border border-white/10 bg-black/50 p-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            2D Physics · {LYRA_MODEL_LABELS[model]} Acoustics
          </span>
          <span className="text-[10px] text-white/45 truncate max-w-[240px]">
            {cadData.spec.subtitle ?? LYRA_VARIANTS[model]?.[variant] ?? model}
          </span>
        </div>
        <canvas
          ref={simCanvasRef}
          width={520}
          height={146}
          className="w-full h-[146px] rounded-lg border border-white/[0.06]"
        />
        <div className="grid grid-cols-3 gap-2.5 px-1 pt-0.5">
          <label className="flex flex-col gap-0.5 text-[10px] text-white/65" title="Seasoned tonewood hemicellulose aging, wool-felt hammer memory, or vintage Alnico & capacitor patina">
            <span className="flex justify-between"><span>Heritage Age</span><span className="font-mono text-[#D9B36C]">{Math.round((patch.params[LY.HERITAGE_AGE] ?? 0.35) * 100)}%</span></span>
            <FocusRange label="Lyra Heritage Age" focusId={`lyra:${track.id}:param:${LY.HERITAGE_AGE}`} trackId={track.id} accentColor={ACCENT} min={0} max={1} step={0.01} value={patch.params[LY.HERITAGE_AGE] ?? 0.35} onValueChange={(v) => setParam(LY.HERITAGE_AGE, v)} className="accent-[#D9B36C] h-1.5" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-white/65" title="Handmade luthier character: dual-polarization bridge coupling, thermal rosin, hand-hammered bore & pole flux">
            <span className="flex justify-between"><span>Craft Character</span><span className="font-mono text-sky-400">{Math.round((patch.params[LY.CRAFT_CHARACTER] ?? 0.3) * 100)}%</span></span>
            <FocusRange label="Lyra Craft Character" focusId={`lyra:${track.id}:param:${LY.CRAFT_CHARACTER}`} trackId={track.id} accentColor="#38BDF8" min={0} max={1} step={0.01} value={patch.params[LY.CRAFT_CHARACTER] ?? 0.3} onValueChange={(v) => setParam(LY.CRAFT_CHARACTER, v)} className="accent-sky-400 h-1.5" />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] text-white/65" title="Undamped sympathetic string resonance & longitudinal compression-wave phantom partials">
            <span className="flex justify-between"><span>Sympathetic</span><span className="font-mono text-amber-400">{Math.round((patch.params[LY.SYMPATHETIC] ?? 0.3) * 100)}%</span></span>
            <FocusRange label="Lyra Sympathetic" focusId={`lyra:${track.id}:param:${LY.SYMPATHETIC}`} trackId={track.id} accentColor="#FBBF24" min={0} max={1} step={0.01} value={patch.params[LY.SYMPATHETIC] ?? 0.3} onValueChange={(v) => setParam(LY.SYMPATHETIC, v)} className="accent-amber-400 h-1.5" />
          </label>
        </div>
      </div>

      {/* The band member who plays this instrument, live — and its lore */}
      <LyraBandSeat track={track} model={model} variant={variant} presetName={patch.name} accent={ACCENT} />

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/40">Preset
          <select value={patch.presetId ?? ''} onChange={(e) => { const p = LYRA_PRESETS.find((x) => x.id === e.target.value); if (p) pickPreset(p); }}
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

      {/* Variant + Sub-Preset quick strip (mirrors TONOS sub-preset pills) */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
        {LYRA_VARIANTS[model].length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] uppercase tracking-[0.16em] text-white/35 mr-1">Type</span>
            {LYRA_VARIANTS[model].map((v, i) => {
              const active = variant === i;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    const match = lyraPresetsForModel(model, i)[0];
                    if (match) pickPreset(match);
                    else setParam(LY.VARIANT, i);
                  }}
                  className="h-5 px-2 rounded-full text-[9.5px] border transition"
                  style={active
                    ? { borderColor: ACCENT, background: 'rgba(217,179,108,0.22)', color: '#FBE6BE', fontWeight: 600 }
                    : { borderColor: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.5)' }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.16em] text-white/35 mr-0.5">Sub-Presets</span>
          {(lyraPresetsForModel(model, LYRA_VARIANTS[model].length > 1 ? variant : undefined).length > 0
            ? lyraPresetsForModel(model, LYRA_VARIANTS[model].length > 1 ? variant : undefined)
            : lyraPresetsForModel(model)
          ).map((p) => {
            const active = p.id === patch.presetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p)}
                title={p.description}
                className="h-6 px-2.5 rounded-lg text-[10px] border transition"
                style={active
                  ? { borderColor: ACCENT, background: 'rgba(217,179,108,0.2)', color: '#FEF3C7', fontWeight: 700 }
                  : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.65)' }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {LYRA_MACRO_ORDER.map((k) => (
          <label key={k} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.04] border border-white/8 p-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{LYRA_MACRO_LABELS[k]}</span>
            <FocusRange
              label={`Lyra ${LYRA_MACRO_LABELS[k]}`}
              focusId={`lyra:${track.id}:macro:${k}`}
              trackId={track.id}
              accentColor={ACCENT}
              min={0}
              max={1}
              step={0.01}
              value={patch.macros[k]}
              onValueChange={(val) => setMacro(k, val)}
              className="w-full accent-[#D9B36C]"
              aria-label={LYRA_MACRO_LABELS[k]}
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
                const toggle = c.id === LY.PEDAL || c.id === LY.LEGATO;
                if (c.options) {
                  const indexed = LYRA_INDEX_PARAMS.includes(c.id);
                  const opts = c.id === LY.PICKUP && variant >= 3 ? LYRA_PICKUPS_HUMBUCKER : c.options;
                  const at = indexed ? Math.round(v) : Math.round(v * (opts.length - 1));
                  return (
                    <label key={c.id} className="flex flex-col gap-0.5 text-[11px] text-white/70" title={c.hint}>{c.label}
                      <select value={at} onChange={(e) => { const i = Number(e.target.value); setParam(c.id, indexed ? i : i / (opts.length - 1)); }}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[12px] text-white">
                        {opts.map((o, i) => <option key={i} value={i} className="bg-black">{o}</option>)}
                      </select>
                    </label>
                  );
                }
                const macroDelta = !toggle && Math.abs(eff - v) >= 0.015;
                return (
                  <label key={c.id} className="flex flex-col gap-0.5" title={c.hint}>
                    <span className="flex justify-between text-[11px] text-white/70">
                      <span>{c.label}</span>
                      <span className="text-white/35">
                        {toggle ? (v > 0.5 ? 'On' : 'Off') : `${Math.round(v * 100)}%${macroDelta ? ` (${Math.round(eff * 100)}%)` : ''}`}
                      </span>
                    </span>
                    {toggle
                      ? <button onClick={() => setParam(c.id, v > 0.5 ? 0 : 1)} className="self-start px-3 py-1 rounded-full text-[10px] border border-white/15" style={v > 0.5 ? { background: ACCENT, color: '#000' } : undefined}>{c.id === LY.PEDAL ? (v > 0.5 ? 'Pedal down' : 'Pedal up') : v > 0.5 ? 'Slurs on' : 'Slurs off'}</button>
                      : (
                        <FocusRange
                          label={`Lyra ${c.label}`}
                          focusId={`lyra:${track.id}:param:${c.id}`}
                          trackId={track.id}
                          accentColor={ACCENT}
                          min={0}
                          max={1}
                          step={0.01}
                          value={v}
                          onValueChange={(val) => setParam(c.id, val)}
                          className="w-full accent-[#D9B36C]"
                          aria-label={c.label}
                        />
                      )}
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
    </div>
  );

  const variantLabel = LYRA_VARIANTS[model]?.[variant] ?? LYRA_MODEL_LABELS[model];
  const workspace = (
    <Split2D3DWorkspace
      trackId={track.id}
      accentHex={ACCENT}
      title3D={`3D CAD · ${LYRA_MODEL_LABELS[model]}`}
      subtitle3D={variantLabel}
      left={body}
      right3D={
        <Instrument3DViewport
          fillHeight
          model={cadData.model}
          spec={cadData.spec}
          trackId={track.id}
          strikeNonce={strikeNonce}
          sustained={model === 'violin' || WIND_MODELS.has(model)}
          heldCount={heldSize}
          subtitle={variantLabel}
          kinematicsMeta={{
            archetype: resolveLyraArchetype(model, variant),
            variant,
            excitePos: patch.params[LY.EXCITE_POS] ?? 0.28,
            isFlute: model === 'flute',
            isSax: model === 'sax',
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
