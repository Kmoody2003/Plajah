// Melos Beats — beatbox → drums, the pure half. Onset detection on a level track, a compact
// spectral fingerprint of each hit, and two classifiers:
//   • a built-in rule set that tells a kick ("boom"), a snare ("psh"/"ka") and a hat ("ts") apart
//     on any mouth, so it works the first time;
//   • "teach it your mouth": a few examples of YOUR sounds per class become templates, and hits
//     are matched to the nearest one (features z-scored, so no single feature dominates).
// The live capture (voiceCapture.ts) feeds it; tests feed synthetic kicks, snares and hats.

export type DrumClass = 'kick' | 'snare' | 'hat' | 'perc';
export const DRUM_CLASSES: DrumClass[] = ['kick', 'snare', 'hat', 'perc'];

/** [log energy, spectral centroid (Hz/1000), low share (<250 Hz), high share (>3.5 kHz), zero-crossing rate, flatness] */
export type HitFeatures = number[];

/** In-place radix-2 FFT magnitude spectrum of a real frame (Hann-windowed, zero-padded to 2^k). */
export function magnitudeSpectrum(x: Float32Array): Float32Array {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1)));
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

/** Fingerprint of a hit from the first ~40 ms after its onset. */
export function hitFeatures(x: Float32Array, sampleRate: number): HitFeatures {
  const mag = magnitudeSpectrum(x);
  const binHz = sampleRate / (mag.length * 2);
  let tot = 0, wsum = 0, low = 0, high = 0, logSum = 0;
  for (let i = 1; i < mag.length; i++) {
    const p = mag[i] * mag[i];
    const hz = i * binHz;
    tot += p; wsum += p * hz;
    if (hz < 250) low += p;
    if (hz > 3500) high += p;
    logSum += Math.log(p + 1e-12);
  }
  let zc = 0, e = 0;
  for (let i = 0; i < x.length; i++) { e += x[i] * x[i]; if (i && (x[i] >= 0) !== (x[i - 1] >= 0)) zc++; }
  const n = mag.length - 1;
  const flat = tot > 0 ? Math.exp(logSum / n) / (tot / n) : 0; // spectral flatness: noise → 1, tone → 0
  return [
    10 * Math.log10(e / x.length + 1e-12),
    tot > 0 ? wsum / tot / 1000 : 0,
    tot > 0 ? low / tot : 0,
    tot > 0 ? high / tot : 0,
    zc / x.length,
    flat,
  ];
}

/** Rules that work without training: low & tonal = kick, bright & noisy = hat, the rest snare. */
export function classifyByRules(f: HitFeatures): DrumClass {
  const [, centroid, low, high, zcr] = f;
  // A kick is low AND nearly tonal (few zero crossings); a snare's body can be just as low, but
  // its noise crosses zero constantly. A hat is bright almost all the way up.
  if ((low > 0.6 && zcr < 0.1) || (centroid < 0.6 && zcr < 0.06)) return 'kick';
  if (high > 0.6 || centroid > 8 || zcr > 0.45) return 'hat';
  return 'snare';
}

export interface MouthModel {
  /** Per-class example fingerprints recorded by "teach it your mouth". */
  examples: Partial<Record<DrumClass, HitFeatures[]>>;
}

/** Nearest-template classifier over z-scored features; falls back to the rules when untrained. */
export function classifyHit(f: HitFeatures, model: MouthModel | null): { cls: DrumClass; confidence: number } {
  const classes = DRUM_CLASSES.filter((c) => (model?.examples[c]?.length ?? 0) > 0);
  if (!model || classes.length < 2) return { cls: classifyByRules(f), confidence: 0.5 };
  const all = classes.flatMap((c) => model.examples[c]!);
  const dims = f.length;
  // Level (index 0) says how hard you hit, not what you said — leave it out of the match.
  const use = Array.from({ length: dims }, (_, i) => i).filter((i) => i !== 0);
  const mean = use.map((i) => all.reduce((s, v) => s + v[i], 0) / all.length);
  const sd = use.map((i, k) => Math.sqrt(all.reduce((s, v) => s + (v[i] - mean[k]) ** 2, 0) / all.length) || 1);
  const z = (v: HitFeatures) => use.map((i, k) => (v[i] - mean[k]) / sd[k]);
  const fz = z(f);
  const dists = classes.map((c) => {
    const ex = model.examples[c]!.map(z);
    const centre = fz.map((_, k) => ex.reduce((s, v) => s + v[k], 0) / ex.length);
    return { c, d: Math.sqrt(centre.reduce((s, v, k) => s + (v - fz[k]) ** 2, 0)) };
  }).sort((a, b) => a.d - b.d);
  const conf = dists.length > 1 ? Math.max(0, Math.min(1, 1 - dists[0].d / (dists[1].d + 1e-9))) : 1;
  return { cls: dists[0].c, confidence: conf };
}

/**
 * Onset detector on a frame-level track: a hit is a jump in level above the recent floor, at least
 * `minGapSec` after the previous hit (so a hit's own decay never re-triggers).
 */
export class OnsetDetector {
  private floor = -80;
  private last = -Infinity;
  constructor(private o = { riseDb: 9, gateDb: -42, minGapSec: 0.07 }) {}
  setOptions(o: Partial<{ riseDb: number; gateDb: number; minGapSec: number }>) { this.o = { ...this.o, ...o }; }
  /** Feed a frame level; returns true when this frame starts a hit. */
  push(t: number, db: number): boolean {
    const hit = db > this.o.gateDb && db - this.floor > this.o.riseDb && t - this.last >= this.o.minGapSec;
    // The floor follows level down quickly and up slowly.
    this.floor = db < this.floor ? db * 0.6 + this.floor * 0.4 : this.floor * 0.97 + db * 0.03;
    if (hit) { this.last = t; this.floor = Math.max(this.floor, db - 3); }
    return hit;
  }
}

/** Which MEKA pad plays each class: a pad named like the class, else the kit's defaults. */
export function defaultPadMap(kit: { name: string; synthVoice?: string; empty?: boolean }[]): Record<DrumClass, number> {
  const find = (re: RegExp, voice: string, fallback: number) => {
    const i = kit.findIndex((p) => !p.empty && (re.test(p.name.toLowerCase()) || p.synthVoice === voice));
    return i >= 0 ? i : fallback;
  };
  return {
    kick: find(/kick|bd/, 'kick', 0),
    snare: find(/snare|sd/, 'snare', 4),
    hat: find(/closed|hat|hh/, 'hat-closed', 8),
    perc: find(/clap|perc|rim/, 'clap', 5),
  };
}

const STORE = 'melos:beatbox:mouth';
export function loadMouthModel(): MouthModel | null {
  try { const m = JSON.parse(localStorage.getItem(STORE) || 'null'); return m && m.examples ? m : null; } catch { return null; }
}
export function saveMouthModel(m: MouthModel | null): void {
  try { if (m) localStorage.setItem(STORE, JSON.stringify(m)); else localStorage.removeItem(STORE); } catch { /* */ }
}
