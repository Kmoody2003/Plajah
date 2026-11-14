// SOMA deep skin — the membrane above SOMA's 16 explicit modes, as real modes.
//
// soma.rs steps 16 circular-membrane modes (m, n) coupled to the striker, and stands in for the
// hundreds above them with an 8-band noise "cloud". With a GPU those modes can simply exist:
// every (m, n) up to the mode budget, both orientations of each m ≥ 1 mode (slightly detuned, so a
// real head's anisotropy beats), each driven open-loop by the voice's own strike force
// (`pa_soma_excitation`). High modes barely move the striker, so open-loop is the right physics.
//
// Every law here mirrors soma.rs (`trigger`, `recompute_modal_structure`, the cloud): base pitch,
// skin material, chamber decay, the viscoelastic overtone law and the air/radiation T60 cap the
// cloud uses, striker footprint and articulation, radiation efficiency and mode pan. Change one
// side, change the other.

import { SM } from '../params';

// ── Bessel functions ────────────────────────────────────────────────────────────────────────

/** J_0..J_M at x by Miller's backward recurrence (f64), normalised by J0 + 2ΣJ2k = 1. */
export function besselJAll(x: number, M: number, out: Float64Array = new Float64Array(M + 1)): Float64Array {
  out.fill(0);
  if (x < 1e-9) { out[0] = 1; return out; }
  const big = Math.max(M, x);
  const start = 2 * Math.ceil((big + 20 + Math.sqrt(40 * big)) / 2);
  let jp1 = 0;
  let j = 1e-30;
  let norm = 0;
  for (let k = start; k > 0; k--) {
    const jm1 = ((2 * k) / x) * j - jp1;
    jp1 = j;
    j = jm1; // J_{k-1}
    const i = k - 1;
    if (i <= M) out[i] = j;
    if (i % 2 === 0) norm += i === 0 ? j : 2 * j;
    if (Math.abs(j) > 1e200) {
      j *= 1e-200; jp1 *= 1e-200; norm *= 1e-200;
      for (let q = Math.min(i, M + 1); q <= M; q++) out[q] *= 1e-200;
    }
  }
  for (let i = 0; i <= M; i++) out[i] /= norm;
  return out;
}

export function besselJ(m: number, x: number): number {
  return besselJAll(x, m)[m];
}

/** Zeros j_mn of J_m below X_MAX: [m, n, j] sorted by j. Built once (~50 ms), on first use. */
const X_MAX = 150;
let zeroTable: Float64Array | null = null; // packed triples

export function besselZeros(): Float64Array {
  if (zeroTable) return zeroTable;
  const M = Math.ceil(X_MAX);
  const step = 0.08;
  const prev = new Float64Array(M + 1);
  const cur = new Float64Array(M + 1);
  const counts = new Int32Array(M + 1);
  const found: number[] = [];
  besselJAll(0.4, M, prev);
  for (let x = 0.4 + step; x <= X_MAX; x += step) {
    besselJAll(x, M, cur);
    for (let m = 0; m <= M && m < x; m++) {
      if (prev[m] === 0 || prev[m] * cur[m] > 0) continue;
      let lo = x - step, hi = x, flo = prev[m];
      for (let it = 0; it < 30; it++) {
        const mid = 0.5 * (lo + hi);
        const fm = besselJ(m, mid);
        if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
      }
      counts[m] += 1;
      found.push(m, counts[m], 0.5 * (lo + hi));
    }
    prev.set(cur);
  }
  const idx = Array.from({ length: found.length / 3 }, (_, i) => i).sort((a, b) => found[3 * a + 2] - found[3 * b + 2]);
  zeroTable = new Float64Array(found.length);
  idx.forEach((s, d) => { zeroTable![3 * d] = found[3 * s]; zeroTable![3 * d + 1] = found[3 * s + 1]; zeroTable![3 * d + 2] = found[3 * s + 2]; });
  return zeroTable;
}

// ── soma.rs mirrors ─────────────────────────────────────────────────────────────────────────

/** The (m, n) pairs soma.rs steps itself (MODE_M / MODE_N). */
const EXPLICIT = new Set(['0,1', '1,1', '2,1', '0,2', '3,1', '1,2', '4,1', '2,2', '0,3', '5,1', '3,2', '6,1', '1,3', '4,2', '7,1', '2,3']);
const J01 = 2.404825557695773;
const J11 = 3.831705970207512;
/** MODE_RAD_EFFICIENCY's trend by azimuthal order (n = 1), extended past m = 7. */
const RAD_M = [1.0, 0.72, 0.42, 0.30, 0.22, 0.18, 0.15, 0.12];
const radEff = (m: number, n: number) => (m < RAD_M.length ? RAD_M[m] : 0.12 * Math.sqrt(8 / (m + 1))) * Math.pow(n, -0.9);

const SKIN: Array<[number, number, number]> = [ // (bending stiffness dispersion, viscous f² loss, T60 scale)
  [0.0014, 0.75, 1.15], [0.0024, 1.35, 0.78], [0.0010, 0.80, 0.90],
  [0.0036, 1.65, 0.72], [0.0045, 1.40, 1.05], [0.0008, 0.65, 0.95],
];
const CHAMBER_T60 = [1.25, 0.68, 0.62, 0.78, 1.10, 0.72];

/** Small deterministic PRNG so a (preset, note, velocity, variant) always builds the same head. */
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

export interface DeepModeSet {
  /** Per kernel mode (c, s, gain, 0): bank L's `groups`·64 modes, then bank R's. */
  coef: Float32Array;
  /** 64-mode groups per bank. */
  groups: number;
  /** Physical modes in the set (orientations counted). */
  modes: number;
  /** Render length in samples (multiple of 64). */
  frames: number;
  /** Ratio (× base pitch) up to which the set carries the skin; cloud bands below it go quiet. */
  topRatio: number;
  baseHz: number;
  topHz: number;
  /** Per physical mode (coef order): frequency in Hz and per-sample decay r. */
  freq: Float32Array;
  decay: Float32Array;
}

const GROUP = 64;
export const DEEP_MODE_BUDGET = 2048;

/**
 * Build the deep skin for one strike. `get(id)` reads the instrument's current parameter values.
 * Returns null when the drum has nothing above its explicit modes worth rendering.
 */
export function buildDeepModes(
  get: (id: number) => number,
  note: number,
  velocity: number,
  sampleRate: number,
  seed: number,
  budget = DEEP_MODE_BUDGET,
): DeepModeSet | null {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const rnd = mulberry(seed * 2654435761 + note * 97 + 13);
  const vel = clamp(velocity, 0.02, 1);

  // Pitch (trigger): diameter → natural pitch, keytracked toward the note, pedal on top.
  const diameter = clamp(get(SM.HEAD_DIAMETER), 0, 1);
  const keytrack = clamp(get(SM.KEYTRACK), 0, 1);
  const naturalHz = 260 * Math.pow(0.2, diameter);
  const noteHz = 440 * Math.pow(2, (note - 69) / 12);
  const pedal = Math.pow(2, ((clamp(get(SM.TENSION_PEDAL), 0, 1) - 0.5) * 24) / 12);
  const baseHz = clamp(naturalHz * Math.pow(noteHz / naturalHz, keytrack), 24, 1200) * pedal;

  // Striker (trigger).
  const striker = clamp(Math.round(get(SM.STRIKER_TYPE)), 0, 5);
  const hardness = clamp(get(SM.STRIKER_HARDNESS), 0, 1);
  const effHard = clamp(hardness + clamp(get(SM.VEL_HARDNESS), 0, 1) * (vel - 0.3) * 0.7, 0.03, 1);
  const mass = clamp(get(SM.STRIKER_MASS), 0, 1);
  const pos = clamp(get(SM.STRIKE_POS), 0, 0.95);
  const rho = clamp(pos + (rnd() * 2 - 1) * 0.005 * pos, 0, 0.95);
  const angle = clamp(get(SM.STRIKE_ANGLE), 0, 1);
  const azimuth = (angle - 0.5) * Math.PI;
  const footprint = [0.105 - 0.055 * effHard, 0.095 - 0.04 * effHard, 0.032 - 0.015 * effHard, 0.135, 0.028 - 0.012 * effHard, 0.022 - 0.01 * effHard][striker];
  const touchDamp = striker === 3 ? 0.00085 + 0.0012 * mass : 0;
  const tilt = (m: number) => (striker === 2 ? (m >= 2 ? 1.75 : 0.85) : striker === 3 ? 0.9 : striker === 5 ? (m >= 1 ? 1.35 : 0.75) : 1);
  const slapClampUpper = striker === 2 ? 1.8 : striker === 3 ? 5.2 : 1;

  // Body (recompute_modal_structure).
  const cavity = clamp(Math.round(get(SM.CAVITY_TYPE)), 0, 5);
  const [stiffDisp, viscF2, matT60] = SKIN[clamp(Math.round(get(SM.SKIN_MATERIAL)), 0, 5)];
  const decay = clamp(get(SM.MEMBRANE_DECAY), 0, 1);
  const dampHf = clamp(get(SM.MEMBRANE_DAMP_HF), 0, 1);
  const baseT60 = (0.08 + 1.85 * Math.pow(decay, 1.8)) * matT60 * CHAMBER_T60[cavity];
  const hfLaw = (0.55 + 1.6 * dampHf) * viscF2;
  const visc = (ratio: number, n: number) => 1 + hfLaw * (0.55 * Math.pow(Math.max(0, ratio - 1.55), 1.25) + 0.9 * Math.max(0, n - 1));
  const jRef = cavity === 0 ? J11 : J01;
  const refK = cavity === 0 ? 1 : 0;
  const refStiff = Math.sqrt(1 + stiffDisp * refK * refK);
  // soma.rs stiffens mode k by √(1 + d·k²) over its 16 modes; k ≈ j²/9 along them, so the same
  // dispersion continued past them is √(1 + 1.667·d·j²) — equal at (2,3), physical above it.
  const beta = 1.667 * stiffDisp;

  const topHz = Math.min(0.45 * sampleRate, 18000);
  const zeros = besselZeros();
  type M = { f: number; g: number; pan: number; r: number; t60: number; ratio: number };
  const modes: M[] = [];
  let idx = 16;
  for (let z = 0; z < zeros.length / 3; z++) {
    const m = zeros[3 * z], n = zeros[3 * z + 1], j = zeros[3 * z + 2];
    if (EXPLICIT.has(`${m},${n}`)) continue;
    const ratio = (j / jRef) * Math.sqrt(1 + beta * j * j) / refStiff;
    const f = baseHz * ratio;
    if (f >= topHz) continue;
    // Contact footprint as a spatial filter. soma.rs's Gaussian is fine over 16 modes but would
    // erase everything past j ≈ 20; a real contact patch (palm, felt, stick tip) has edges and
    // filters like a disc, 2·J1(x)/x — envelope (1 + (x/2.2)²)^-0.75: same start, power-law tail.
    const x = j * footprint;
    const w = besselJ(m, j * rho) * Math.pow(1 + (x / 2.2) ** 2, -0.75) * tilt(m);
    const g0 = w * 0.065 * radEff(m, n);
    // The cloud's decay law for this region: half the viscous excess, capped by air radiation.
    const airCap = 0.09 * Math.sqrt(1000 / Math.max(f, 100));
    // (radial order 1 for all, as the cloud: its law was tuned by measurement for exactly this region)
    const t60 = Math.max(0.004, Math.min(airCap, baseT60 / ((1 + 0.5 * (visc(ratio, 1) - 1)) * slapClampUpper)));
    const dps = 6.907755 / t60 + touchDamp * (0.45 + 0.55 * Math.abs(w)) * sampleRate;
    const r = Math.exp(-dps / sampleRate);
    const spread = 0.35 + 0.45 * rho;
    if (m === 0) {
      modes.push({ f, g: g0, pan: 0, r, t60, ratio });
    } else {
      // Two orientations about a random nodal axis: the strike excites them by cos / sin of
      // m·(strike − axis), detuned a fraction of a percent by the head's uneven tension.
      const axis = (rnd() * 2 * Math.PI) / m;
      const detune = 0.0015 + 0.003 * rnd();
      const pan = clamp(Math.sin(m * azimuth + idx * 0.65) * spread, -0.85, 0.85);
      modes.push({ f: f * (1 - detune / 2), g: g0 * Math.cos(m * (azimuth - axis)), pan, r, t60, ratio });
      modes.push({ f: f * (1 + detune / 2), g: g0 * Math.sin(m * (azimuth - axis)), pan: -pan, r, t60, ratio });
    }
    idx++;
  }
  // Keep what can be heard, lowest first, up to the budget.
  const gMax = modes.reduce((a, b) => Math.max(a, Math.abs(b.g)), 0);
  if (gMax <= 0) return null;
  const kept = modes.filter((md) => Math.abs(md.g) > gMax * 1e-4).sort((a, b) => a.f - b.f).slice(0, budget);
  if (!kept.length) return null;
  const truncated = kept.length === budget;
  const topRatio = truncated ? kept[kept.length - 1].ratio : 1e6;

  let longest = 0;
  for (const md of kept) if (Math.abs(md.g) > gMax * 0.01) longest = Math.max(longest, md.t60);
  const frames = Math.ceil(clamp(longest + 0.09, 0.15, 2.5) * sampleRate / GROUP) * GROUP;

  const groups = Math.ceil(kept.length / GROUP);
  const coef = new Float32Array(2 * groups * GROUP * 4);
  const freq = Float32Array.from(kept, (md) => md.f);
  const modeDecay = Float32Array.from(kept, (md) => md.r);
  kept.forEach((md, i) => {
    const w = (2 * Math.PI * md.f) / sampleRate;
    const c = md.r * Math.cos(w), s = md.r * Math.sin(w);
    const gl = md.g * Math.sqrt(0.5 * (1 - md.pan));
    const gr = md.g * Math.sqrt(0.5 * (1 + md.pan));
    coef.set([c, s, gl, 0], i * 4);
    coef.set([c, s, gr, 0], (groups * GROUP + i) * 4);
  });
  return { coef, groups, modes: kept.length, frames, topRatio, baseHz, topHz: kept[kept.length - 1].f, freq, decay: modeDecay };
}

// -- Level: matched to the cloud it replaces --------------------------------------------------

/** |DFT|^2 of `x` zero-padded to n (power of two), bins 0..n/2. */
function powerSpectrum(x: Float32Array, n: number): Float64Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, half = len >> 1;
    const wr0 = Math.cos(a), wi0 = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half;
        const xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr;
        re[q] = re[p] - xr; im[q] = im[p] - xi;
        re[p] += xr; im[p] += xi;
        const t = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = t;
      }
    }
  }
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

/**
 * Scale the set's gains, half-octave by half-octave, so the deep skin carries the energy the
 * noise cloud would have put there for this same strike (`cloud`, from pa_soma_excitation).
 *
 * The open-loop modes alone are physically right in structure but ~35 dB short up top: a smooth
 * contact force has little energy past a few kHz, and what makes a struck skin bright (radiation
 * rising with frequency, the edges of a hand, finger slaps) is exactly what the cloud's level was
 * measured and tuned to (SOMA realism pass, 2026-10-28). So the cloud keeps setting how much energy
 * each band gets, and the real modes decide how it is distributed: beating pairs, inharmonic
 * density, strike-position nodes, stereo spread.
 */
export function matchCloudLevel(set: DeepModeSet, drive: Float32Array, cloud: Float32Array, sampleRate: number): void {
  const n = 16384, hz = sampleRate / n;
  const X = powerSpectrum(drive, n);
  const C = powerSpectrum(cloud, n);
  const bands: number[] = [];
  for (let f = Math.max(60, set.freq[0] / 1.2); f < sampleRate * 0.45; f *= Math.SQRT2) bands.push(f);
  if (bands.length < 2) return;
  const band = (f: number) => Math.min(bands.length - 1, Math.max(0, Math.floor(Math.log(f / bands[0]) / Math.log(Math.SQRT2))));
  const fill = (v: Float64Array) => {
    let last = NaN;
    for (let b = 0; b < v.length; b++) { if (Number.isFinite(v[b])) last = v[b]; else v[b] = last; }
    last = NaN;
    for (let b = v.length - 1; b >= 0; b--) { if (Number.isFinite(v[b])) last = v[b]; else v[b] = last; }
  };
  const interp = (v: Float64Array, f: number) => {
    // Log-frequency interpolation between band centres, so no band edge is audible.
    const pos = Math.log(f / bands[0]) / Math.log(Math.SQRT2) - 0.5;
    const b0 = Math.max(0, Math.min(bands.length - 1, Math.floor(pos)));
    const b1 = Math.min(bands.length - 1, b0 + 1);
    const t = Math.max(0, Math.min(1, pos - b0));
    return Math.exp(Math.log(v[b0]) * (1 - t) + Math.log(v[b1]) * t);
  };

  // 1. Decay. The cloud keeps being fed by the contact, slap and rim for tens of ms, so its bands
  // ring longer than the bare law — and that ring is what the realism pass tuned. Measure each
  // band's decay in this strike's cloud (short-time energy slope from its peak) and move the modes
  // in that band onto it, keeping their spread relative to each other.
  const W = 1024, times = [2, 8, 16, 28, 44, 64, 90, 120];
  const db: number[][] = bands.map(() => []);
  const seg = new Float32Array(W);
  for (const ms of times) {
    const start = Math.round((ms / 1000) * sampleRate);
    for (let i = 0; i < W; i++) seg[i] = (cloud[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1)));
    const P = powerSpectrum(seg, W);
    const e = new Float64Array(bands.length);
    for (let k = 1; k < W / 2; k++) e[band((k * sampleRate) / W)] += P[k];
    for (let b = 0; b < bands.length; b++) db[b].push(10 * Math.log10(e[b] + 1e-30));
  }
  const bandT60 = new Float64Array(bands.length).fill(NaN);
  for (let b = 0; b < bands.length; b++) {
    const d = db[b];
    const top = d.indexOf(Math.max(...d));
    const pts: Array<[number, number]> = [];
    for (let j = top; j < d.length && d[j] > d[top] - 45 && d[j] > -200; j++) pts.push([times[j] / 1000, d[j]]);
    if (pts.length < 3) continue;
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (slope < -5) bandT60[b] = Math.min(1.5, Math.max(0.004, 60 / -slope));
  }
  fill(bandT60);
  if (Number.isFinite(bandT60[0])) {
    const t60Of = (r: number) => 6.907755 / (-Math.log(r) * sampleRate);
    const logSum = new Float64Array(bands.length), count = new Float64Array(bands.length);
    for (let i = 0; i < set.modes; i++) { const b = band(set.freq[i]); logSum[b] += Math.log(t60Of(set.decay[i])); count[b]++; }
    const meanT60 = new Float64Array(bands.length).fill(NaN);
    for (let b = 0; b < bands.length; b++) if (count[b]) meanT60[b] = Math.exp(logSum[b] / count[b]);
    fill(meanT60);
    let longest = 0;
    for (let i = 0; i < set.modes; i++) {
      const f = set.freq[i];
      const t60 = Math.min(1.5, Math.max(0.004, t60Of(set.decay[i]) * (interp(bandT60, f) / interp(meanT60, f))));
      const r = Math.exp(-6.907755 / (t60 * sampleRate));
      const k = r / set.decay[i];
      for (const o of [i * 4, (set.groups * GROUP + i) * 4]) { set.coef[o] *= k; set.coef[o + 1] *= k; }
      set.decay[i] = r;
      longest = Math.max(longest, t60);
    }
    set.frames = Math.max(set.frames, Math.ceil(Math.min(2.5, longest + 0.09) * sampleRate / GROUP) * GROUP);
  }

  // 2. Level. Energy the deep layer would carry per band (mono, before scaling), and the cloud's.
  const deepE = new Float64Array(bands.length), cloudE = new Float64Array(bands.length);
  const g = (i: number) => 0.5 * (Math.abs(set.coef[i * 4 + 2]) + Math.abs(set.coef[(set.groups * GROUP + i) * 4 + 2]));
  for (let i = 0; i < set.modes; i++) {
    const r = set.decay[i];
    deepE[band(set.freq[i])] += g(i) ** 2 * X[Math.round(set.freq[i] / hz)] / (2 * (1 - r * r));
  }
  for (let k = 1; k < n / 2; k++) cloudE[band(k * hz)] += (2 / n) * C[k];
  // In the voice the cloud splits 0.62/0.38 across L/R, so it reaches the mono sum at 0.5 in
  // amplitude (0.25 in energy); the deep pair reaches it at g = mean(gL, gR), as computed here.
  const peak = Math.max(...cloudE);
  const factor = new Float64Array(bands.length).fill(NaN);
  for (let b = 0; b < bands.length; b++) {
    if (deepE[b] > 0 && cloudE[b] > peak * 1e-5) factor[b] = Math.sqrt((0.25 * cloudE[b]) / deepE[b]);
  }
  // Bands the cloud doesn't reach (below its first band, above its last) hold their neighbour.
  fill(factor);
  if (!Number.isFinite(factor[0])) return; // no cloud at all: keep the physical level
  const clamped = factor.map((v) => Math.min(3000, Math.max(0.1, v)));
  for (let i = 0; i < set.modes; i++) {
    const k = interp(clamped, set.freq[i]);
    set.coef[i * 4 + 2] *= k;
    set.coef[(set.groups * GROUP + i) * 4 + 2] *= k;
  }
}
