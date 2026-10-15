// AURA's 1960s & 1970s vintage hardware wavetable bank.
//
// While AURA's pure VCO mode uses PolyBLEP saw/pulse/triangle/sine, many of the most iconic
// 1960s and 1970s timbres relied on distinct hardware waveshapers and divide-down or tape
// spectra: the Minimoog's triangular-saw "Sharktooth", Don Buchla's 259 diode wavefolder,
// ARP Solina's top-octave divide-down string resonator, Mellotron M400 magnetic tape formants,
// 1967 Vox/Farfisa transistor combo-organ drawbar mixtures, and the Yamaha CS-80's glottal-spiked
// IG00153 sawtooth.
//
// Each table is 32 frames × 2048 samples, constant-RMS normalised so sweeping Wave Contour
// morphs harmonic structure without jumping in volume.

import { FRAME_SIZE, FRAMES } from '../onda/wavetables';

export { FRAME_SIZE, FRAMES };

const MAX_H = 384;
const TARGET_RMS = 0.30;
const PEAK_CEILING = 1.18;

let SIN: Float32Array | null = null;
function sinTable(): Float32Array {
  if (!SIN) {
    SIN = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) SIN[i] = Math.sin((2 * Math.PI * i) / FRAME_SIZE);
  }
  return SIN;
}

function spectral(fn: (h: number, t: number, out: [number, number]) => void): Float32Array {
  const sin = sinTable();
  const mask = FRAME_SIZE - 1;
  const out = new Float32Array(FRAMES * FRAME_SIZE);
  const hv: [number, number] = [0, 0];

  for (let f = 0; f < FRAMES; f++) {
    const t = FRAMES > 1 ? f / (FRAMES - 1) : 0;
    const base = f * FRAME_SIZE;
    for (let h = 1; h <= MAX_H; h++) {
      hv[0] = 0;
      hv[1] = 0;
      fn(h, t, hv);
      const a = hv[0];
      if (Math.abs(a) < 1e-5) continue;
      const pOff = Math.round((hv[1] / (2 * Math.PI)) * FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE; i++) {
        out[base + i] += a * sin[(h * i + pOff) & mask];
      }
    }
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const v = out[base + i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / FRAME_SIZE);
    if (rms > 1e-9 && peak > 1e-9) {
      const g = Math.min(TARGET_RMS / rms, PEAK_CEILING / peak);
      for (let i = 0; i < FRAME_SIZE; i++) out[base + i] *= g;
    }
  }
  return out;
}

export interface AuraTableDef {
  id: string;
  name: string;
  era: string;
  journey: string;
  build: () => Float32Array;
}

export const AURA_WAVETABLES: AuraTableDef[] = [
  {
    id: 'aura-moog-shark',
    name: "'68 Modular Sharktooth",
    era: '1968–1972 East Coast',
    journey: 'rounded triangle → Minimoog sharktooth → capacitor-sloped saw → narrow pulse',
    build: () => spectral((h, t, out) => {
      const tri = h % 2 ? (8 / (Math.PI * Math.PI)) * (h % 4 === 1 ? 1 : -1) / (h * h) : 0;
      const saw = (2 / (Math.PI * h)) * (h % 2 ? 1 : -1) * Math.exp(-h * 0.004);
      const shark = tri * 0.58 + saw * 0.62;
      const pulse = (2 / (Math.PI * h)) * Math.sin(h * Math.PI * 0.24);
      if (t < 0.35) {
        const u = t / 0.35;
        out[0] = tri * (1 - u) + shark * u;
        out[1] = u * 0.35 / Math.sqrt(h);
      } else if (t < 0.7) {
        const u = (t - 0.35) / 0.35;
        out[0] = shark * (1 - u) + saw * u;
        out[1] = (1 - u) * 0.35 / Math.sqrt(h);
      } else {
        const u = (t - 0.7) / 0.3;
        out[0] = saw * (1 - u) + pulse * u;
      }
    }),
  },
  {
    id: 'aura-buchla-fold',
    name: "'66 West-Coast Complex",
    era: '1966 San Francisco Tape Center',
    journey: 'warm sine → symmetry-warped triangle → 5-stage diode wavefolder overtones',
    build: () => spectral((h, t, out) => {
      const foldIdx = 0.6 + t * 5.2;
      // Buchla 259 timbre circuit: odd harmonics dominate early, even harmonics bloom with symmetry
      const oddWeight = h % 2 === 1 ? 1.0 : 0.25 + 0.55 * Math.sin(t * Math.PI);
      const besselApprox = Math.sin(h * foldIdx * 0.62 + (h % 2) * 0.8) / Math.pow(h, 0.72);
      const baseSine = h === 1 ? 1.0 - t * 0.45 : 0;
      out[0] = baseSine + t * oddWeight * besselApprox * 0.95;
      out[1] = (h * 0.17 * t) % (2 * Math.PI);
    }),
  },
  {
    id: 'aura-solina-divide',
    name: "'74 Divide-Down Ensemble",
    era: '1974 String Symphonizer',
    journey: '8\' Viola saw → 8\'+4\' Violin octave coupler → Horn/Cello formant body',
    build: () => spectral((h, t, out) => {
      // Top-octave divide-down sawtooth + octave coupler (even harmonics boosted as 4' mixes in)
      const saw8 = 1 / h;
      const saw4 = h % 2 === 0 ? (0.75 * t) / (h * 0.5) : 0;
      // Solina string high-pass / body formant around harmonics 3..14
      const formantCenter = 4.0 + t * 6.0;
      const d = (h - formantCenter) / 4.5;
      const body = 0.45 + 0.75 * Math.exp(-d * d);
      out[0] = (saw8 + saw4) * body * Math.exp(-h * 0.008);
      out[1] = (h % 3) * 0.42;
    }),
  },
  {
    id: 'aura-mellotron-tape',
    name: "'69 M400 Magnetic Tape",
    era: '1969 Abbey Road / Prog',
    journey: 'M400 Flute breathy odd partials → 3-Violins bowed resin → Boys Choir vowel formant',
    build: () => spectral((h, t, out) => {
      // Morphs across three acoustic tape formant envelopes:
      // 0.0: Strawberry Fields Flute (strong 1st, 2nd, 3rd, soft airy upper harmonics)
      // 0.5: M400 3-Violins (rich bowed mid harmonics 2..12 with tape rolloff above H24)
      // 1.0: M400 Choir (three vocal formant peaks around H2, H5, H11)
      const flute = Math.exp(-Math.pow((h - 1.5) / 2.2, 2)) + 0.22 * Math.exp(-Math.pow((h - 5) / 3.0, 2));
      const strings = (1 / Math.pow(h, 0.82)) * (0.5 + 0.7 * Math.exp(-Math.pow((h - 6) / 5.0, 2))) * Math.exp(-h * 0.035);
      const choir = (1 / Math.pow(h, 0.9)) * (
        0.9 * Math.exp(-Math.pow((h - 2) / 1.4, 2)) +
        0.75 * Math.exp(-Math.pow((h - 6) / 2.1, 2)) +
        0.45 * Math.exp(-Math.pow((h - 13) / 3.0, 2))
      );
      if (t < 0.5) {
        const u = t * 2;
        out[0] = flute * (1 - u) + strings * u;
      } else {
        const u = (t - 0.5) * 2;
        out[0] = strings * (1 - u) + choir * u;
      }
      out[1] = Math.sin(h * 1.3) * 0.6;
    }),
  },
  {
    id: 'aura-combo-organ',
    name: "'67 Transistor Combo",
    era: '1967 Psychedelic Garage / Baroque',
    journey: 'Vox flute drawbars (16\'+8\') → Continental reed mixture (IV) → Farfisa multi-tone bite',
    build: () => spectral((h, t, out) => {
      // Drawbar harmonics: 1, 2, 3, 4, 6, 8, 10, 12, 16 plus transistor divider odd harmonics
      const drawbars: Record<number, number> = {
        1: 1.0,
        2: 0.85,
        3: 0.45 + 0.45 * t,
        4: 0.7 + 0.3 * t,
        6: 0.35 + 0.55 * t,
        8: 0.4 + 0.5 * t,
        10: 0.25 * t,
        12: 0.35 * t,
        16: 0.3 * t,
      };
      const db = drawbars[h] ?? 0;
      const reed = (t * 0.45 / Math.pow(h, 0.95)) * (h % 2 === 1 ? 1.0 : 0.6);
      out[0] = (db + reed) * Math.exp(-h * 0.018);
    }),
  },
  {
    id: 'aura-cs80-glottal',
    name: "'77 CS-80 Pulse-Glottal",
    era: '1977 Vangelis / Poly Brass',
    journey: 'warm saw → CS-80 IG00153 spiked saw → wide glottal brass resonance',
    build: () => spectral((h, t, out) => {
      // CS-80 sawtooth has a narrow high-pass spike at the reset edge that keeps the waveform
      // shimmering even when the low-pass filter is dark.
      const saw = 1 / h;
      const spike = 0.28 * (0.3 + 0.7 * t) * Math.sin(h * 0.18 * (1 + t)) / Math.pow(h, 0.55);
      out[0] = (saw + spike) * Math.exp(-h * 0.005);
      out[1] = -h * 0.04 * t;
    }),
  },
];

export const auraTableIndex = (id: string): number =>
  Math.max(0, AURA_WAVETABLES.findIndex((w) => w.id === id));

let cache: Map<string, Float32Array> | null = null;

export function getAuraWavetable(id: string): Float32Array | null {
  if (!cache) cache = new Map();
  const hit = cache.get(id);
  if (hit) return hit;
  const def = AURA_WAVETABLES.find((w) => w.id === id);
  if (!def) return null;
  const data = def.build();
  cache.set(id, data);
  return data;
}

export const AURA_TABLE_IDS = AURA_WAVETABLES.map((w) => w.id);
export const AURA_TABLE_NAMES = AURA_WAVETABLES.map((w) => w.name);
