// Headless Acoustic Physics Bench for SOMA (plajah_audio.wasm).
// Renders each percussion archetype and measures real physical-acoustics metrics:
//   1. Peak Attack Time (ms) & Crest Factor (dB)
//   2. Two-Stage Energy Decay Curve: E(20ms), E(80ms), E(200ms), E(500ms), E(1000ms) in dB relative to peak RMS
//   3. Spectral Centroid Trajectory: Attack (0..12ms) vs Body (40..120ms) vs Tail (200..400ms)
//   4. Nonlinear Tension Pitch Glide: Instantaneous f0 at 8..25ms vs settled f0 at 90..180ms

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, '../services/melos/beats/engine/dsp/plajah_audio.wasm');
const wasmBytes = readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);

const SR = 48000;
const BLOCK = 128;

// Param IDs
const P_MASTER_GAIN = 0;
const SOMA_BASE = 1800;
const SM = {
  ENABLE: 1800,
  STRIKER_TYPE: 1801,
  STRIKER_HARDNESS: 1802,
  STRIKER_MASS: 1803,
  STRIKE_POS: 1804,
  STRIKE_ANGLE: 1805,
  VEL_HARDNESS: 1806,
  HAND_BRUSH: 1807,
  HEAD_DIAMETER: 1810,
  SKIN_MATERIAL: 1811,
  MEMBRANE_DAMP: 1812,
  MEMBRANE_DAMP_HF: 1813,
  AIR_LOAD: 1814,
  TENSION_NONLIN: 1815,
  TENSION_PEDAL: 1816,
  BUZZ_AMOUNT: 1817,
  KEYTRACK: 1818,
  CAVITY_TYPE: 1820,
  CAVITY_VOLUME: 1821,
  CAVITY_COUPLING: 1822,
  PORT_TUNING: 1823,
  SHELL_MATERIAL: 1824,
  SHELL_RESONANCE: 1825,
  SHELL_WARMTH: 1826,
  MIC_DISTANCE: 1827,
  ROOM_EARLY: 1828,
};

function renderNote(params, note = 48, velocity = 0.9, durationSec = 1.5) {
  const inst = new WebAssembly.Instance(wasmModule, {});
  const exp = inst.exports;
  const eng = exp.pa_create(SR);
  exp.pa_set_param(eng, P_MASTER_GAIN, 0.85);
  exp.pa_set_param(eng, SM.ENABLE, 1.0);
  for (const [k, v] of Object.entries(params)) {
    exp.pa_set_param(eng, Number(k), v);
  }

  exp.pa_note_on(eng, note, velocity, 1, 0);
  const totalFrames = Math.floor(durationSec * SR);
  const out = new Float32Array(totalFrames);
  const blocks = Math.ceil(totalFrames / BLOCK);

  for (let b = 0; b < blocks; b++) {
    exp.pa_render(eng, BLOCK);
    const ptrL = exp.pa_out_ptr(eng, 0);
    const ptrR = exp.pa_out_ptr(eng, 1);
    const bufL = new Float32Array(exp.memory.buffer, ptrL, BLOCK);
    const bufR = new Float32Array(exp.memory.buffer, ptrR, BLOCK);
    const base = b * BLOCK;
    for (let i = 0; i < BLOCK && base + i < totalFrames; i++) {
      out[base + i] = 0.5 * (bufL[i] + bufR[i]);
    }
  }
  exp.pa_destroy(eng);
  return out;
}

function rmsWindow(signal, startMs, endMs) {
  const i0 = Math.max(0, Math.floor((startMs * 0.001) * SR));
  const i1 = Math.min(signal.length, Math.floor((endMs * 0.001) * SR));
  if (i1 <= i0) return 0;
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / (i1 - i0));
}

function spectralCentroid(signal, startMs, endMs) {
  const i0 = Math.max(0, Math.floor((startMs * 0.001) * SR));
  const N = Math.min(1024, Math.floor(((endMs - startMs) * 0.001) * SR));
  if (N < 64 || i0 + N > signal.length) return 0;
  let num = 0;
  let den = 0;
  const maxBin = Math.min(N >> 1, Math.floor((8000 * N) / SR));
  for (let k = 1; k < maxBin; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
      const x = signal[i0 + n] * hann;
      re += x * Math.cos(w * n);
      im -= x * Math.sin(w * n);
    }
    const mag = Math.hypot(re, im);
    const freq = (k * SR) / N;
    num += freq * mag;
    den += mag;
  }
  return den > 1e-9 ? num / den : 0;
}

function estimateZeroCrossingHz(signal, startMs, endMs) {
  const i0 = Math.max(1, Math.floor((startMs * 0.001) * SR));
  const i1 = Math.min(signal.length - 1, Math.floor((endMs * 0.001) * SR));
  // Low-pass filter copy so we track fundamental zero crossings
  let lp = 0;
  let prev = 0;
  const crossings = [];
  for (let i = i0; i < i1; i++) {
    lp += 0.035 * (signal[i] - lp);
    if (prev <= 0 && lp > 0) {
      crossings.push(i);
    }
    prev = lp;
  }
  if (crossings.length < 2) return 0;
  const avgPeriodSamples = (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
  return SR / avgPeriodSamples;
}

function analyzeSignal(name, sig) {
  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < sig.length; i++) {
    const a = Math.abs(sig[i]);
    if (a > peak) {
      peak = a;
      peakIdx = i;
    }
  }
  const peakMs = (peakIdx / SR) * 1000;
  const rmsAttack = rmsWindow(sig, 0, 22);
  const rmsBody = rmsWindow(sig, 0, 200);
  const rms80 = rmsWindow(sig, 65, 95);
  const rms200 = rmsWindow(sig, 185, 215);
  const rms500 = rmsWindow(sig, 480, 520);
  const rms1000 = rmsWindow(sig, 960, 1020);

  const db = (r) => (r > 1e-6 && rmsAttack > 1e-6 ? (20 * Math.log10(r / rmsAttack)).toFixed(1) : '-inf');
  const crestDb = rmsBody > 1e-6 ? (20 * Math.log10(peak / rmsBody)).toFixed(1) : '0';

  const centAttack = spectralCentroid(sig, 0, 14);
  const centBody = spectralCentroid(sig, 45, 100);
  const centTail = spectralCentroid(sig, 160, 260);

  const fStart = estimateZeroCrossingHz(sig, 4, 32);
  const fSettled = estimateZeroCrossingHz(sig, 65, 155);
  const pitchDropSt = fStart > 20 && fSettled > 20 ? (12 * Math.log2(fStart / fSettled)).toFixed(2) : '0.00';

  console.log(
    `${name.padEnd(28)} | Pk:${peak.toFixed(2)}@${peakMs.toFixed(1).padStart(4)}ms | Crest:${crestDb.padStart(5)}dB | Decay [80ms:${db(rms80).padStart(6)}, 200ms:${db(rms200).padStart(6)}, 500ms:${db(rms500).padStart(6)}, 1s:${db(rms1000).padStart(6)}] | Cent[${centAttack.toFixed(0)}->${centBody.toFixed(0)}->${centTail.toFixed(0)}Hz] | Glide:${pitchDropSt}st`
  );
}

const cases = [
  {
    name: '29" Timpani (Felt Mallet)',
    note: 48,
    params: {
      [SM.CAVITY_TYPE]: 0, [SM.STRIKER_TYPE]: 0, [SM.SKIN_MATERIAL]: 0, [SM.SHELL_MATERIAL]: 1,
      [SM.HEAD_DIAMETER]: 0.78, [SM.MEMBRANE_DAMP]: 0.72, [SM.MEMBRANE_DAMP_HF]: 0.44,
      [SM.AIR_LOAD]: 0.88, [SM.TENSION_NONLIN]: 0.24, [SM.STRIKE_POS]: 0.70,
      [SM.STRIKER_HARDNESS]: 0.48, [SM.STRIKER_MASS]: 0.56, [SM.CAVITY_VOLUME]: 0.76,
      [SM.CAVITY_COUPLING]: 0.78, [SM.PORT_TUNING]: 0.48, [SM.SHELL_RESONANCE]: 0.54,
    },
  },
  {
    name: 'Djembe Open Tone (Hand)',
    note: 55,
    params: {
      [SM.CAVITY_TYPE]: 1, [SM.STRIKER_TYPE]: 1, [SM.SKIN_MATERIAL]: 1, [SM.SHELL_MATERIAL]: 0,
      [SM.HEAD_DIAMETER]: 0.36, [SM.MEMBRANE_DAMP]: 0.50, [SM.MEMBRANE_DAMP_HF]: 0.46,
      [SM.AIR_LOAD]: 0.74, [SM.TENSION_NONLIN]: 0.38, [SM.STRIKE_POS]: 0.74,
      [SM.STRIKER_HARDNESS]: 0.62, [SM.STRIKER_MASS]: 0.52, [SM.CAVITY_VOLUME]: 0.58,
      [SM.CAVITY_COUPLING]: 0.84, [SM.PORT_TUNING]: 0.38, [SM.SHELL_RESONANCE]: 0.68,
    },
  },
  {
    name: 'Djembe Center Bass (Doum)',
    note: 41,
    params: {
      [SM.CAVITY_TYPE]: 1, [SM.STRIKER_TYPE]: 1, [SM.SKIN_MATERIAL]: 1, [SM.SHELL_MATERIAL]: 0,
      [SM.HEAD_DIAMETER]: 0.40, [SM.MEMBRANE_DAMP]: 0.54, [SM.MEMBRANE_DAMP_HF]: 0.68,
      [SM.AIR_LOAD]: 0.82, [SM.TENSION_NONLIN]: 0.52, [SM.STRIKE_POS]: 0.04,
      [SM.STRIKER_HARDNESS]: 0.42, [SM.STRIKER_MASS]: 0.76, [SM.CAVITY_VOLUME]: 0.68,
      [SM.CAVITY_COUPLING]: 0.94, [SM.PORT_TUNING]: 0.26, [SM.SHELL_RESONANCE]: 0.64,
    },
  },
  {
    name: 'Djembe Edge Slap (Claque)',
    note: 62,
    params: {
      [SM.CAVITY_TYPE]: 1, [SM.STRIKER_TYPE]: 2, [SM.SKIN_MATERIAL]: 1, [SM.SHELL_MATERIAL]: 0,
      [SM.HEAD_DIAMETER]: 0.34, [SM.MEMBRANE_DAMP]: 0.38, [SM.MEMBRANE_DAMP_HF]: 0.24,
      [SM.AIR_LOAD]: 0.68, [SM.TENSION_NONLIN]: 0.46, [SM.STRIKE_POS]: 0.86,
      [SM.STRIKER_HARDNESS]: 0.86, [SM.STRIKER_MASS]: 0.32, [SM.CAVITY_VOLUME]: 0.54,
      [SM.CAVITY_COUPLING]: 0.72, [SM.PORT_TUNING]: 0.46, [SM.SHELL_RESONANCE]: 0.72,
    },
  },
  {
    name: 'Havana Conga Open (Stave)',
    note: 50,
    params: {
      [SM.CAVITY_TYPE]: 2, [SM.STRIKER_TYPE]: 1, [SM.SKIN_MATERIAL]: 3, [SM.SHELL_MATERIAL]: 2,
      [SM.HEAD_DIAMETER]: 0.34, [SM.MEMBRANE_DAMP]: 0.50, [SM.MEMBRANE_DAMP_HF]: 0.58,
      [SM.AIR_LOAD]: 0.78, [SM.TENSION_NONLIN]: 0.32, [SM.STRIKE_POS]: 0.66,
      [SM.STRIKER_HARDNESS]: 0.56, [SM.STRIKER_MASS]: 0.62, [SM.CAVITY_VOLUME]: 0.68,
      [SM.CAVITY_COUPLING]: 0.84, [SM.PORT_TUNING]: 0.42, [SM.SHELL_RESONANCE]: 0.70,
    },
  },
  {
    name: 'Conga Tapon (Muted Hand)',
    note: 52,
    params: {
      [SM.CAVITY_TYPE]: 2, [SM.STRIKER_TYPE]: 3, [SM.SKIN_MATERIAL]: 3, [SM.SHELL_MATERIAL]: 2,
      [SM.HEAD_DIAMETER]: 0.34, [SM.MEMBRANE_DAMP]: 0.24, [SM.MEMBRANE_DAMP_HF]: 0.74,
      [SM.AIR_LOAD]: 0.76, [SM.TENSION_NONLIN]: 0.28, [SM.STRIKE_POS]: 0.42,
      [SM.STRIKER_HARDNESS]: 0.62, [SM.STRIKER_MASS]: 0.72, [SM.CAVITY_VOLUME]: 0.66,
      [SM.CAVITY_COUPLING]: 0.72, [SM.PORT_TUNING]: 0.42, [SM.SHELL_RESONANCE]: 0.64,
    },
  },
];

for (const c of cases) {
  const sig = renderNote(c.params, c.note, 0.9, 1.2);
  analyzeSignal(c.name, sig);
}
