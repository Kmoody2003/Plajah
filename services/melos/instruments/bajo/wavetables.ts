// BAJO's factory wavetables.
//
// The five morph families from the Phase-0 prototype, which is where most of the instrument's
// character actually lived. Until these existed every BAJO preset ran on the analog oscillators,
// and Reese and Growl were approximations of themselves.
//
// Same contract as ONDA's bank: procedural (no licensing exposure, and a table can be *designed*
// to evolve across its frames), 32 frames of 2048 samples, band-limited by the Rust mip builder
// at load so these generators write the raw ideal waveform.
//
// Every family here is additive with a per-harmonic amplitude — and, for Reese, a per-harmonic
// PHASE, which is the whole trick and the one thing ONDA's `additive` helper cannot express.

import { FRAME_SIZE, FRAMES } from '../onda/wavetables';

export { FRAME_SIZE, FRAMES };

/**
 * Harmonics worth writing. The mip pyramid band-limits per playback rate anyway, so this is
 * about table richness rather than aliasing: 512 harmonics over a 40 Hz fundamental reaches past
 * 20 kHz, which is as much as the table can usefully carry.
 */
const MAX_H = 512;

/** Every frame of every family is scaled to this RMS, so morphing changes timbre and not level. */
const TARGET_RMS = 0.30;
/** ...unless hitting it would need a peak this far above unity, which spiky frames would. */
const PEAK_CEILING = 1.2;

/**
 * A sine lookup indexed by phase in units of 1/FRAME_SIZE of a cycle.
 *
 * Every one of these tables is a sum of a few hundred sinusoids across 32 frames of 2048 samples.
 * Called through `Math.sin` that is tens of millions of transcendental calls per table and a
 * visible stall at patch load; as an integer-indexed lookup it is a multiply, a mask and a read.
 * Phase quantises to 1/2048 of a cycle, which is inaudible.
 */
let SIN: Float32Array | null = null;
function sinTable(): Float32Array {
  if (!SIN) {
    SIN = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) SIN[i] = Math.sin((2 * Math.PI * i) / FRAME_SIZE);
  }
  return SIN;
}

/**
 * Build a table from a per-harmonic spectrum.
 *
 * `spectrum(h, t, out)` writes `out[0] = amplitude` and `out[1] = phase in radians` for harmonic
 * `h` at morph position `t`. Returning an amplitude near zero skips the harmonic entirely.
 */
function spectral(fn: (h: number, t: number, out: [number, number]) => void): Float32Array {
  const sin = sinTable();
  const mask = FRAME_SIZE - 1; // FRAME_SIZE is a power of two, so modulo is a mask
  const out = new Float32Array(FRAMES * FRAME_SIZE);
  const hv: [number, number] = [0, 0];

  for (let f = 0; f < FRAMES; f++) {
    const t = FRAMES > 1 ? f / (FRAMES - 1) : 0;
    const base = f * FRAME_SIZE;
    for (let h = 1; h <= MAX_H; h++) {
      hv[0] = 0; hv[1] = 0;
      fn(h, t, hv);
      const a = hv[0];
      if (Math.abs(a) < 1e-5) continue;
      // Phase as an integer offset into the sine lookup.
      const pOff = Math.round((hv[1] / (2 * Math.PI)) * FRAME_SIZE);
      for (let i = 0; i < FRAME_SIZE; i++) {
        out[base + i] += a * sin[(h * i + pOff) & mask];
      }
    }
    // Normalise to constant RMS, not constant peak.
    //
    // ONDA normalises by peak, which is the conventional choice, but on a morphing table it
    // means the morph knob is also a volume knob: peak-normalised, this bank's sine frame sits
    // 11 dB above its pulse frame, and the Fold family lands 12 dB under Analog. Sweeping a
    // morph should change timbre, not level, and a preset author setting an oscillator to 80%
    // should get the same loudness whichever family they picked.
    //
    // The peak ceiling is the safety valve: a genuinely spiky frame (a folder, a narrow pulse)
    // would need a peak of 2+ to hit the target RMS, so it gives up some loudness rather than
    // eat all the headroom before the filter and Scorch stages.
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

/** The five classic single-cycle spectra, as anchors for the Analog family's morph. */
function anchor(kind: number, h: number): number {
  switch (kind) {
    case 0: return h === 1 ? 1 : 0;                                             // sine
    case 1: return h % 2 ? (8 / (Math.PI * Math.PI)) * (h % 4 === 1 ? 1 : -1) / (h * h) : 0; // triangle
    case 2: return (2 / (Math.PI * h)) * (h % 2 ? 1 : -1);                      // saw
    case 3: return h % 2 ? 4 / (Math.PI * h) : 0;                               // square
    default: return (2 / (Math.PI * h)) * Math.sin(h * Math.PI * 0.22);         // narrow pulse
  }
}

export interface BajoTableDef {
  id: string;
  name: string;
  /** One line on what sweeping the morph actually does. */
  journey: string;
  build: () => Float32Array;
}

export const BAJO_WAVETABLES: BajoTableDef[] = [
  {
    id: 'bajo-analog',
    name: 'Analog',
    journey: 'sine → triangle → saw → square → pulse',
    // The baseline. Everything a bass patch wants before it wants anything clever.
    build: () => spectral((h, t, out) => {
      const p = t * 4;
      const k = Math.min(3, Math.floor(p));
      const frac = p - k;
      out[0] = anchor(k, h) * (1 - frac) + anchor(k + 1, h) * frac;
    }),
  },
  {
    id: 'bajo-reese',
    name: 'Reese',
    journey: 'clean saw → phase-smeared → hollow and moving',
    // The bass table. A Reese is not a detune — it is one waveform whose partials have drifted
    // out of phase alignment with each other, so the peak flattens and the sound hollows out
    // while the spectrum stays exactly where it was. Quadratic in h, so high partials smear
    // faster than low ones, which is what stops it sounding like a phaser.
    build: () => spectral((h, t, out) => {
      out[0] = 2 / (Math.PI * h);
      out[1] = t * h * h * 0.26 + t * h * 1.9;
    }),
  },
  {
    id: 'bajo-growl',
    name: 'Growl',
    journey: 'formant peak climbing the harmonic series',
    // A resonant bump that walks UP the partials as the morph opens. Emphasising by harmonic
    // INDEX rather than by frequency is what keeps the growl locked to the note instead of
    // drifting into a fixed filter band as you play up the neck.
    build: () => spectral((h, t, out) => {
      const peak = 1.6 + t * 17;
      const bw = 1.6 + t * 3.2;
      const d = (h - peak) / bw;
      out[0] = (2 / (Math.PI * h)) * (0.22 + Math.exp(-d * d));
    }),
  },
  {
    id: 'bajo-fold',
    name: 'Fold',
    journey: 'soft bell → folded and buzzing',
    // West-coast timbre: harmonic amplitudes that oscillate in sign rather than rolling off, the
    // spectral signature of a wavefolder. Gains harmonics as the morph opens instead of losing
    // them, which is the opposite of what a filter does and why it sits differently in a mix.
    build: () => spectral((h, t, out) => {
      out[0] = (Math.sin(h * (0.35 + t * 2.6)) / (h * 0.75 + 0.6)) * 0.9;
    }),
  },
  {
    id: 'bajo-metal',
    name: 'Metal',
    journey: 'saw → combed → hollow metallic',
    // A comb over the harmonic series: whole runs of partials notched out, so the tone reads as
    // struck metal rather than as a filtered saw. The morph changes the comb spacing.
    build: () => spectral((h, t, out) => {
      const g = Math.cos(h * (1 + t * 3.1)) * 0.5 + 0.5;
      out[0] = (2 / (Math.PI * h)) * (0.15 + g);
    }),
  },
];

/** Table slot for an id — the index in this bank. BAJO owns its engine, so slots are its own. */
export const bajoTableIndex = (id: string): number =>
  Math.max(0, BAJO_WAVETABLES.findIndex((w) => w.id === id));

let cache: Map<string, Float32Array> | null = null;

/** Build (once) and return a table's samples. Built lazily — a patch pays only for what it uses. */
export function getBajoWavetable(id: string): Float32Array | null {
  if (!cache) cache = new Map();
  const hit = cache.get(id);
  if (hit) return hit;
  const def = BAJO_WAVETABLES.find((w) => w.id === id);
  if (!def) return null;
  const data = def.build();
  cache.set(id, data);
  return data;
}

export const BAJO_TABLE_IDS = BAJO_WAVETABLES.map((w) => w.id);
export const BAJO_TABLE_NAMES = BAJO_WAVETABLES.map((w) => w.name);
