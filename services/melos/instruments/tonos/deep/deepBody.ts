// TONOS deep body: the dense upper body of each instrument as real modes, for the GPU.
//
// tonos.rs steps a handful of narrow body modes (the plate's first few, the Helmholtz air, the
// skin's first Bessel modes) and stands in for everything above them with one or two broad
// "floor" bandpasses. Above ~1 kHz a real body is a dense field of modes — a soundboard's plate
// modes arrive at a constant density, a cavity's air modes at a density rising with f², a skin's
// Bessel modes linearly — and that field is what gives a plucked string its body: the uneven,
// beating, position-dependent colour on every partial. Here it is built from the same body
// description tonos.rs uses (bodies.ts) and rendered on the GPU (soma/deep/gpuModal.ts), driven by
// the bridge force the voice actually produced (`pa_tonos_excitation`).
//
// The level per third-octave is matched to the floors it replaces, for this note (`matchFloors`):
// the floors' level is what the instruments were balanced to, so the deep body keeps that balance
// and the modes decide the structure. The modes never feed back into the string: above a kilohertz
// a body mode moves the bridge far less than the string pushes it (the same reasoning as SOMA's
// deep skin).

import { besselJ, besselZeros } from '../../soma/deep/deepModes';
import {
  acquireF64Scratch,
  fftRadix2,
  lruSet,
  lruTouch,
  realPowerSpecInto,
  releaseF64Scratch,
} from '../../soma/deep/deepUtil';
import { ageTonewood, HERITAGE_TONEWOODS } from '../../physics/heritageAcoustics';
import { TONOS_BODIES, type TonosBodySpec } from './bodies';

const GROUP = 64;
export const TONOS_DEEP_BUDGET = 2048;
/** Floors centred at or above this are replaced — DEEP_FLOOR_HZ in tonos.rs. */
export const DEEP_FLOOR_HZ = 1000;
/** The deep body starts here: below it the floors' skirts are the body's own explicit modes. */
const START_HZ = 700;
const GUARD_HZ = START_HZ / Math.SQRT2;
const C_AIR = 343;

export interface TonosDeepSet {
  /** Per kernel mode (c, s, gain, 0): bank L's `groups`·64 modes, then bank R's. */
  coef: Float32Array;
  groups: number;
  modes: number;
  freq: Float32Array;
  /** Per-sample decay r. */
  decay: Float32Array;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal (Box–Muller). */
const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());

/**
 * Mode frequencies for a density n(f) (modes/Hz) between f0 and f1, with the level repulsion of a
 * real structure: spacings in the unfolded coordinate follow the Wigner surmise (no two modes sit
 * on top of each other, none leave big holes), which is what an irregular plate or cavity does.
 */
function unfold(n: (f: number) => number, f0: number, f1: number, rnd: () => number, cap: number): number[] {
  const out: number[] = [];
  let f = f0;
  while (f < f1 && out.length < cap) {
    // Wigner surmise P(s) = (π/2)s·exp(−πs²/4): inverse CDF s = √(−4·ln(1−u)/π).
    const s = Math.sqrt((-4 * Math.log(1 - Math.min(0.999999, rnd()))) / Math.PI);
    f += s / Math.max(1e-6, n(f));
    if (f < f1) out.push(f);
  }
  return out;
}

interface Mode { f: number; g: number; q: number; pan: number }

/** What the body's own physics says lives above the explicit modes. */
function bodyModes(
  b: TonosBodySpec,
  size: number,
  skinT: number,
  top: number,
  rnd: () => number,
  heritageAge = 0.28,
  craftAsym = 0.22,
): Mode[] {
  const modes: Mode[] = [];
  const fs = size;
  // Tai et al. (PNAS 2017/2021) hemicellulose hydrolysis & seasoned mineral ground:
  // raises specific sound speed c_L and lowers internal loss tangent tan(δ).
  const baseWood = b.kind === 'gourd' ? HERITAGE_TONEWOODS.aged_gourd : HERITAGE_TONEWOODS.cremonese_spruce;
  const agedWood = ageTonewood(baseWood, heritageAge, heritageAge * 0.5);
  const lossScale = agedWood.lossLong / baseWood.lossLong;
  const cScale = agedWood.cLong / Math.sqrt(baseWood.eLong / baseWood.rho);
  const bridgeHillGain = 1 + 0.42 * heritageAge;
  const bridgeHillHz = 2380 * (0.94 + 0.12 * cScale);
  const pan = () => Math.max(-0.8, Math.min(0.8, (rnd() * 2 - 1) * 0.55));
  const push = (f: number, g: number, q: number) => {
    if (f >= START_HZ && f < top) {
      // Cremonese / carved-top Bridge-Hill radiation focus around 2.1–2.8 kHz (above low-skirt guard)
      const wHi = Math.max(0, Math.min(1, (f - 1200) / 800));
      const bh = 1 + wHi * (bridgeHillGain - 1) * Math.exp(-(((f - bridgeHillHz) / 520) ** 2));
      const fAged = f + wHi * f * (0.12 * (cScale - 1));
      if (fAged < top) modes.push({ f: fAged, g: g * bh, q, pan: pan() });
    }
  };
  // A cavity behind the board or skin: V from its Helmholtz mode (a fixed neck/hole ratio), so a
  // deeper air resonance means a bigger box. Air modes radiate through the hole and the board: weak.
  const helm = Math.max(40, b.helm * fs);
  const vol = Math.min(0.06, Math.max(4e-4, 0.008 * (150 / helm) ** 2));
  const airN = (f: number) => (4 * Math.PI * vol * f * f) / C_AIR ** 3;
  const airQ = (f: number) => 1 / (0.009 + 0.006 * Math.sqrt(f / 1000));
  const plate = (f1: number, gain: number, eta0: number) => {
    // A thin plate's modal density is constant, n = S/(2κ); its lowest mode f₁ ≈ κπ/S, so
    // n ≈ π/(2f₁). Bracing and the back add their own families: ×2, the back at lower gain.
    // Apply hemicellulose Q-brightening smoothly above 1.2 kHz so 700 Hz boundary modes keep
    // exact low-skirt isolation below 500 Hz.
    const etaAt = (base: number, f: number) => {
      const w = Math.max(0, Math.min(1, (f - 1200) / 1400));
      const ls = 1 + (lossScale - 1) * w;
      return (base + 0.012 * (f / 5000)) * ls;
    };
    const n = Math.PI / (2 * Math.max(40, f1));
    for (const f of unfold(() => n, START_HZ, top, rnd, 4000)) push(f, gain * gauss(rnd), 1 / etaAt(eta0, f));
    for (const f of unfold(() => n * 0.8, START_HZ, top, rnd, 4000)) {
      const fCraft = f * (1 + 0.004 * (craftAsym - 0.22));
      push(fCraft, 0.45 * gain * gauss(rnd), 1 / etaAt(eta0 * 1.2, fCraft));
    }
  };
  switch (b.kind) {
    case 'wood': {
      plate(b.plate * fs, 1, 0.009);
      for (const f of unfold(airN, START_HZ, top, rnd, 3000)) push(f, 0.22 * gauss(rnd), airQ(f));
      break;
    }
    case 'gourd': {
      // A gourd or calabash wall: a thick, lossy shell — seasoned dried calabash stiffens with age.
      plate(b.plate, 0.9, 0.016);
      for (const f of unfold(airN, START_HZ, top, rnd, 3000)) push(f, 0.3 * gauss(rnd), airQ(f));
      break;
    }
    case 'tube': {
      // Bamboo tube: the air column's harmonics carry on up, and the wall's flexural modes.
      const f0 = b.plate * fs;
      for (let k = 1; k * f0 < top; k++) push(k * f0 * (1 + (0.0008 + 0.0014 * craftAsym) * k * (rnd() - 0.5)), 0.6 / Math.sqrt(k) * (rnd() < 0.5 ? -1 : 1), 1 / ((0.012 + 0.004 * Math.sqrt((k * f0) / 1000)) * lossScale));
      plate(b.plate * 3 * fs, 0.7, 0.011);
      break;
    }
    case 'skin': {
      // Circular membrane: f_mn = j_mn/(2πa)·√(Tₛ/σ). tonos.rs steps the first eight; carry on from
      // the ninth. The bridge foot stands off-centre on the skin (ρ ≈ 0.35 of the radius), so each
      // mode is driven by J_m(j·ρ); m ≥ 1 comes as two orientations, detuned by uneven dorsal-spine tension.
      const c = Math.sqrt((b.ts * skinT) / b.sigma) * (1 + 0.03 * heritageAge);
      const k0 = c / (2 * Math.PI * b.a) * fs;
      const rho = 0.35 + 0.03 * craftAsym;
      const zeros = besselZeros();
      for (let z = 8; z < zeros.length / 3; z++) {
        const m = zeros[3 * z], j = zeros[3 * z + 2];
        const f = j * k0;
        if (f >= top) break;
        if (f < START_HZ) continue;
        const w = besselJ(m, j * rho) * Math.pow(1 + (j / 40) ** 2, -0.5);
        const q = 1 / ((0.012 + 0.02 * (f / 3000)) * (1 - 0.14 * heritageAge));
        if (m === 0) push(f, w, q);
        else {
          const axis = rnd() * 2 * Math.PI;
          const det = 0.002 + 0.003 * rnd() + 0.006 * craftAsym / Math.sqrt(m);
          push(f * (1 - det / 2), w * Math.cos(m * axis), q);
          push(f * (1 + det / 2), w * Math.sin(m * axis), q);
        }
      }
      for (const f of unfold(airN, START_HZ, top, rnd, 3000)) push(f, 0.12 * gauss(rnd), airQ(f));
      break;
    }
  }
  return modes;
}

/** TN_* values the body depends on (mirror params.ts: BODY_SIZE = 2014, SKIN_TENSION = 2015, HERITAGE_AGE = 2029, CRAFT_ASYMMETRY = 2030). */
export function bodyScales(get: (id: number) => number): { size: number; skinT: number; heritageAge: number; craftAsym: number } {
  const p = (id: number, d: number) => { const v = get(id); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d; };
  return {
    size: Math.pow(2, (0.5 - p(2014, 0.5)) * 1.5),
    skinT: Math.pow(2, (p(2015, 0.5) - 0.5) * 2),
    heritageAge: p(2029, 0.28),
    craftAsym: p(2030, 0.22),
  };
}

/**
 * The deep body of instrument `inst` at these parameters. Same for every note: only its level
 * (matchFloors) depends on the note. Null for bowed/wheeled instruments.
 */
export function buildTonosDeepBody(inst: number, get: (id: number) => number, sampleRate: number, budget = TONOS_DEEP_BUDGET): TonosDeepSet | null {
  const b = TONOS_BODIES[Math.max(0, Math.min(TONOS_BODIES.length - 1, Math.round(inst)))];
  if (!b || b.sustained) return null;
  const { size, skinT, heritageAge, craftAsym } = bodyScales(get);
  const top = Math.min(0.45 * sampleRate, 16000);
  const rnd = mulberry(0x70b0d1e5 ^ Math.imul(inst + 1, 2654435761));
  let modes = bodyModes(b, size, skinT, top, rnd, heritageAge, craftAsym).filter((m) => m.g !== 0 && Number.isFinite(m.f));
  if (!modes.length) return null;
  // Over budget: thin evenly (every mode's chance the same), so the density's shape survives;
  // matchFloors restores each band's energy.
  if (modes.length > budget) {
    const keep = budget / modes.length;
    const thinned = modes.filter(() => rnd() < keep);
    modes = thinned.slice(0, budget);
  }
  modes.sort((x, y) => x.f - y.f);
  const groups = Math.ceil(modes.length / GROUP);
  const coef = new Float32Array(2 * groups * GROUP * 4);
  const freq = new Float32Array(modes.length);
  const decay = new Float32Array(modes.length);
  modes.forEach((m, i) => {
    const w = (2 * Math.PI * m.f) / sampleRate;
    const r = Math.exp(-w / (2 * m.q));
    const c = r * Math.cos(w), s = r * Math.sin(w);
    // tonos.rs's radiation law: mode_l = g(1 − s), mode_r = g(1 + s) → the mono mean is g.
    coef.set([c, s, m.g * (1 - m.pan), 0], i * 4);
    coef.set([c, s, m.g * (1 + m.pan), 0], (groups * GROUP + i) * 4);
    freq[i] = m.f;
    decay[i] = r;
  });
  return { coef, groups, modes: modes.length, freq, decay };
}

// ── Level: matched to the floors it replaces ────────────────────────────────────────────────

/** |DFT|² of `x` zero-padded to n (power of two), bins 0..n/2. */
export function powerSpectrum(x: Float32Array, n: number): Float64Array {
  const out = new Float64Array(n / 2 + 1);
  realPowerSpecInto(x, x.length, n, out);
  return out;
}

/**
 * The drive the GPU modes get: the bridge force through (1 - z⁻²). The kernel's modes are complex
 * one-poles read as Im(z) — a two-pole with no zero at DC, whose skirts stay up across the whole
 * band; summed over thousands of modes they'd leak into the low end. tonos.rs's body modes are
 * bandpasses b₀(1 - z⁻²)/(…) with zeros at DC and Nyquist; feeding the kernel this drive gives each
 * GPU mode that same shape. matchFloors is given this drive too, so its prediction matches.
 */
export function bandpassDrive(drive: Float32Array): Float32Array {
  const out = new Float32Array(drive.length);
  for (let i = 0; i < drive.length; i++) out[i] = drive[i] - (i >= 2 ? drive[i - 2] : 0);
  return out;
}

/**
 * The floors' own sound below the deep body (zero-phase, raised-cosine crossover from 500 to
 * START_HZ). The deep body only replaces the floors where it has modes; below that, the floors'
 * skirts stay — they add to (and partly cancel) the explicit modes' tails in the voice, and leaving
 * them out would move the low mids. The layer carries this alongside the GPU modes.
 */
export function floorsBelow(floors: Float32Array, sampleRate: number): Float32Array {
  let n = 1024;
  while (n < floors.length + 4096) n <<= 1;
  const re = acquireF64Scratch(n);
  const im = acquireF64Scratch(n);
  try {
    for (let i = 0; i < floors.length; i++) re[i] = floors[i]!;
    re.fill(0, floors.length, n);
    im.fill(0, 0, n);
    fftRadix2(re, im, n, false);
    const lo = 500, hi = START_HZ;
    for (let k = 0; k <= n / 2; k++) {
      const f = (k * sampleRate) / n;
      const w = f <= lo ? 1 : f >= hi ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (f - lo)) / (hi - lo));
      re[k]! *= w;
      im[k]! *= w;
      if (k > 0 && k < n / 2) {
        re[n - k]! *= w;
        im[n - k]! *= w;
      }
    }
    fftRadix2(re, im, n, true);
    const out = new Float32Array(floors.length);
    for (let i = 0; i < out.length; i++) out[i] = re[i]!;
    return out;
  } finally {
    releaseF64Scratch(re);
    releaseF64Scratch(im);
  }
}

/** How long the layer needs to be: until the floors have fallen 60 dB from their peak. */
export function layerFrames(floors: Float32Array, sampleRate: number, maxFrames: number): number {
  const W = 1024;
  let peak = 0, last = 0;
  const e: number[] = [];
  for (let i = 0; i + W <= floors.length; i += W) {
    let s = 0;
    for (let k = 0; k < W; k++) s += floors[i + k] * floors[i + k];
    e.push(s);
    peak = Math.max(peak, s);
  }
  e.forEach((s, i) => { if (s > peak * 1e-6) last = i; });
  const secs = ((last + 1) * W) / sampleRate + 0.05;
  return Math.min(maxFrames, Math.ceil(Math.max(0.25, secs) * sampleRate / GROUP) * GROUP);
}

/**
 * Per-mode gain scales so the deep body carries, for this note, what the floors would have added.
 * `drive` is what the GPU modes will be driven with (bandpassDrive of the bridge force); `floors`,
 * `rest` (the body's other modes) and `below` (the floors' part the layer keeps, floorsBelow) are
 * the same note's. Everything is predicted as complex spectra, bin by bin: the deep modes, the rest
 * of the body and the floors are all the same bridge force through resonators, so they add with
 * their phases — a string's drive is a comb of partials with only a few modes near each, and an
 * energy-only estimate misses by several dB per band.
 * Returns null when the floors are silent (nothing to replace).
 */
export function matchFloors(set: TonosDeepSet, drive: Float32Array, floors: Float32Array, sampleRate: number, rest?: Float32Array, below?: Float32Array): Float32Array | null {
  const scales = floorScales(set, drive, floors, sampleRate, rest, below);
  if (!scales) return null;
  return applyScales(set, scales);
}

/** `set`'s coefficients with each mode's gain multiplied by `scales[i]`. */
export function applyScales(set: TonosDeepSet, scales: Float32Array): Float32Array {
  const coef = set.coef.slice();
  for (let i = 0; i < set.modes; i++) {
    coef[i * 4 + 2] *= scales[i];
    coef[(set.groups * GROUP + i) * 4 + 2] *= scales[i];
  }
  return coef;
}

/** FFTs of the far-field kernels for transform size n (cached: they only depend on n). */
const kernelCache = new Map<number, { kDir: { re: Float64Array; im: Float64Array }; kMir: { re: Float64Array; im: Float64Array } }>();
function farKernels(n: number) {
  const hit = lruTouch(kernelCache, n);
  if (hit) return hit;
  const N2 = 2 * n, half2 = n / 2, dw = (2 * Math.PI) / n;
  const cotH = (j: number) => 0.5 / Math.tan((j * dw) / 2);
  // Direct kernel K'(t) = K(−t), for S_far = G ∗ K'; mirror kernel Q(u) = conj K(u).
  const kDir = { re: new Float64Array(N2), im: new Float64Array(N2) };
  for (let t = -(half2 - 1); t <= half2 - 1; t++) {
    if (t === 0) continue;
    const idx = (t + N2) % N2;
    kDir.re[idx] = 0.5; kDir.im[idx] = cotH(-t);
  }
  fftRadix2(kDir.re, kDir.im, N2, false);
  const kMir = { re: new Float64Array(N2), im: new Float64Array(N2) };
  for (let u = 1; u < n; u++) { kMir.re[u] = 0.5; kMir.im[u] = -cotH(u); }
  fftRadix2(kMir.re, kMir.im, N2, false);
  const out = { kDir, kMir };
  lruSet(kernelCache, n, out, 4);
  return out;
}

export function floorScales(set: TonosDeepSet, drive: Float32Array, floors: Float32Array, sampleRate: number, rest?: Float32Array, below?: Float32Array): Float32Array | null {
  const len = Math.min(drive.length, floors.length);
  let n = 1024;
  while (n < len && n < 1 << 17) n <<= 1;
  const hz = sampleRate / n;
  const half2 = n / 2;
  const N2 = 2 * n;
  const step = Math.pow(2, 1 / 3);
  const bands: number[] = [];
  for (let f = START_HZ; f < sampleRate * 0.45; f *= step) bands.push(f);
  const nb = bands.length;
  const band = (f: number) => Math.min(nb - 1, Math.max(0, Math.floor(Math.log(f / bands[0]) / Math.log(step))));
  const k0b = Math.ceil(GUARD_HZ / hz);

  const xcRe = acquireF64Scratch(n);
  const xcIm = acquireF64Scratch(n);
  const bRe = acquireF64Scratch(n);
  const bIm = acquireF64Scratch(n);
  const sRe = acquireF64Scratch(half2);
  const sIm = acquireF64Scratch(half2);
  const gRe = acquireF64Scratch(N2);
  const gIm = acquireF64Scratch(N2);
  const cRe = acquireF64Scratch(N2);
  const cIm = acquireF64Scratch(N2);
  try {
    const copyLen = Math.min(n, len);
    for (let i = 0; i < copyLen; i++) xcRe[i] = drive[i]!;
    xcRe.fill(0, copyLen, n);
    xcIm.fill(0, 0, n);
    fftRadix2(xcRe, xcIm, n, false);

    // Pack base (rest + below) into real and total (rest + floors) into imag for a single FFT.
    for (let i = 0; i < copyLen; i++) {
      const r = rest ? rest[i]! : 0;
      bRe[i] = r + (below ? below[i]! : 0);
      bIm[i] = r + floors[i]!;
    }
    bRe.fill(0, copyLen, n);
    bIm.fill(0, copyLen, n);
    fftRadix2(bRe, bIm, n, false);

    const binBand = new Int32Array(half2);
    for (let k = 0; k < half2; k++) binBand[k] = k < k0b ? -1 : band(k * hz);
    const targetE = new Float64Array(nb), baseE = new Float64Array(nb);
    for (let k = k0b; k < half2; k++) {
      const nk = n - k;
      const zrk = bRe[k]!, zik = bIm[k]!, zrn = bRe[nk]!, zin = bIm[nk]!;
      const br = 0.5 * (zrk + zrn), bi = 0.5 * (zik - zin);
      const tr = 0.5 * (zik + zin), ti = 0.5 * (zrn - zrk);
      bRe[k] = br;
      bIm[k] = bi;
      const b = binBand[k]!;
      targetE[b] += tr * tr + ti * ti;
      baseE[b] += br * br + bi * bi;
    }
    const peak = Math.max(...targetE);
    if (!(peak > 0)) return null;

    const g0 = (i: number) => 0.5 * (set.coef[i * 4 + 2]! + set.coef[(set.groups * GROUP + i) * 4 + 2]!);
    const dw = (2 * Math.PI) / n;
    const cdw = Math.cos(dw), sdw = Math.sin(dw);
    const cotH = (j: number) => 0.5 / Math.tan((j * dw) / 2); // Im K(j), j ≠ 0
    const { kDir, kMir } = farKernels(n);
    const kBin = Float64Array.from({ length: set.modes }, (_, i) => Math.round((2 * Math.PI * set.freq[i]!) / sampleRate / dw));
    const scales = new Float32Array(set.modes).fill(1);
    const deepOnly = new Float64Array(nb), withBase = new Float64Array(nb);
    const predict = () => {
      // Far field: binned gains G, then S_far = G ∗ K' and M = corr(G, Q).
      gRe.fill(0, 0, N2);
      gIm.fill(0, 0, N2);
      for (let i = 0; i < set.modes; i++) {
        const kb = kBin[i]!;
        if (kb > 0 && kb < half2) gRe[kb] += g0(i) * scales[i]!;
      }
      fftRadix2(gRe, gIm, N2, false);
      for (let k = 0; k < N2; k++) {
        const gr = gRe[k]!, gi = gIm[k]!, kr = kDir.re[k]!, ki = kDir.im[k]!;
        cRe[k] = gr * kr - gi * ki;
        cIm[k] = gr * ki + gi * kr;
      }
      fftRadix2(cRe, cIm, N2, true);
      for (let k = 0; k < half2; k++) { sRe[k] = cRe[k]!; sIm[k] = cIm[k]!; }
      // Mirror: M(k) = Σ_t G[t]·Q(t + k) = IFFT(conj(FFT G)·FFT Q)[k] (G real). S −= M.
      for (let k = 0; k < N2; k++) {
        const gr = gRe[k]!, gi = gIm[k]!, kr = kMir.re[k]!, ki = kMir.im[k]!;
        cRe[k] = gr * kr + gi * ki;
        cIm[k] = gr * ki - gi * kr;
      }
      fftRadix2(cRe, cIm, N2, true);
      for (let k = 0; k < half2; k++) { sRe[k] -= cRe[k]!; sIm[k] -= cIm[k]!; }
      // Near field: replace each mode's far approximation by its exact response within ±3 bandwidths.
      for (let i = 0; i < set.modes; i++) {
        const r = set.decay[i]!, gi = g0(i) * scales[i]!;
        const theta = (2 * Math.PI * set.freq[i]!) / sampleRate;
        const km = kBin[i];
        if (km <= 0 || km >= half2) continue;
        const h = Math.max(4, Math.ceil((3 * (1 - r)) / dw));
        const ka = Math.max(1, km - h), kb = Math.min(half2 - 1, km + h);
        let c = Math.cos(theta - ka * dw), sn = Math.sin(theta - ka * dw);
        for (let k = ka; k <= kb; k++) {
          const dr = 1 - r * c, di = -r * sn;
          const den = dr * dr + di * di;
          sRe[k] += (gi * dr) / den;
          sIm[k] -= (gi * di) / den;
          const j = km - k;
          if (j !== 0) { sRe[k] -= gi * 0.5; sIm[k] -= gi * cotH(j); }
          const nc = c * cdw + sn * sdw;
          sn = sn * cdw - c * sdw;
          c = nc;
        }
      }
      deepOnly.fill(0); withBase.fill(0);
      for (let k = k0b; k < half2; k++) {
        const b = binBand[k]!;
        const xr = xcRe[k]!, xi = xcIm[k]!;
        // X·S, then ÷ 2i: (a + ib)/(2i) = (b − ia)/2
        const pr = xr * sRe[k]! - xi * sIm[k]!, pi = xr * sIm[k]! + xi * sRe[k]!;
        const dr = pi * 0.5, di = -pr * 0.5;
        deepOnly[b] += dr * dr + di * di;
        const yr = bRe[k]! + dr, yi = bIm[k]! + di;
        withBase[b] += yr * yr + yi * yi;
      }
    };

    const factor = new Float64Array(nb).fill(NaN);
    const live = (b: number) => targetE[b]! > peak * 1e-7;
    predict();
    for (let b = 0; b < nb; b++) {
      if (deepOnly[b]! > 0 && live(b)) factor[b] = Math.sqrt(Math.max(targetE[b]! - baseE[b]!, 0.05 * targetE[b]!) / deepOnly[b]!);
    }
    const fill = () => {
      let last = NaN;
      for (let b = 0; b < nb; b++) { if (Number.isFinite(factor[b])) last = factor[b]!; else factor[b] = last; }
      last = NaN;
      for (let b = nb - 1; b >= 0; b--) { if (Number.isFinite(factor[b])) last = factor[b]!; else factor[b] = last; }
    };
    fill();
    if (!Number.isFinite(factor[0])) return null;
    const interp = (f: number) => {
      const pos = Math.log(f / bands[0]!) / Math.log(step) - 0.5;
      const b0 = Math.max(0, Math.min(nb - 1, Math.floor(pos)));
      const b1 = Math.min(nb - 1, b0 + 1);
      const t = Math.max(0, Math.min(1, pos - b0));
      return Math.exp(Math.log(factor[b0]!) * (1 - t) + Math.log(factor[b1]!) * t);
    };
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < set.modes; i++) scales[i] = interp(set.freq[i]!);
      predict();
      for (let b = 0; b < nb; b++) {
        if (!live(b) || !(deepOnly[b]! > 0)) continue;
        const want = Math.max(targetE[b]! - baseE[b]!, 0.05 * targetE[b]!);
        const got = Math.max(withBase[b]! - baseE[b]!, 0.05 * deepOnly[b]!);
        factor[b] *= Math.min(2, Math.max(0.5, Math.sqrt(want / got)));
      }
    }
    for (let i = 0; i < set.modes; i++) scales[i] = interp(set.freq[i]!);
    return scales;
  } finally {
    releaseF64Scratch(xcRe);
    releaseF64Scratch(xcIm);
    releaseF64Scratch(bRe);
    releaseF64Scratch(bIm);
    releaseF64Scratch(sRe);
    releaseF64Scratch(sIm);
    releaseF64Scratch(gRe);
    releaseF64Scratch(gIm);
    releaseF64Scratch(cRe);
    releaseF64Scratch(cIm);
  }
}
