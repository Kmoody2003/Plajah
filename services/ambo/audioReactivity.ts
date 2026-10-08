// audioReactivity — make generators MOVE with the music, not sit near the top of the meter.
//
// An AnalyserNode's byte spectrum maps ~70 dB (-100…-30) onto 0…255. Real music
// sits in the top third of that and its beat-to-beat swing is a few dB, so a
// generator that reads the raw bytes sees bass hovering ~0.77 ± 0.06, mids at a
// constant ~0.49 ± 0.01 and a "beat" flag (bass > 0.6) that is almost always on.
// Visuals driven by that look mellow, and a quiet master looks even flatter.
//
// The conditioner tracks, per frequency group, a slowly-moving floor and ceiling
// and re-expresses each bin between them. A group that is constant stays
// near-flat (it should); a group that pulses now fills the whole 0…1 range, at
// any master volume. A minimum range stops silence / hiss being amplified.
//
// Pure (injected clock via dt) so it is testable; `strength` blends raw → conditioned.

export interface ConditionerOptions {
  /** Frequency groups (bins are split evenly in log-ish widths). Default 12. */
  groups?: number;
  /** Seconds for the ceiling to fall / the floor to rise when the music gets quieter. Default 3.5. */
  release?: number;
  /** Smallest floor→ceiling span (0..1 of full scale) that is still stretched. Default 0.18. */
  minRange?: number;
}

export interface BeatState { pulse: number; onset: boolean }

export class ReactivityConditioner {
  private groups: number;
  private release: number;
  private minRange: number;
  private floor: Float32Array;
  private ceil: Float32Array;
  private edges: number[] = [];
  private bins = 0;
  private slowBass = 0;
  private pulse = 0;
  private onsetCooldown = 0;
  /** 0 = raw spectrum, 1 = fully conditioned. */
  strength = 0.85;

  constructor(opts: ConditionerOptions = {}) {
    this.groups = opts.groups ?? 12;
    this.release = opts.release ?? 3.5;
    this.minRange = opts.minRange ?? 0.18;
    this.floor = new Float32Array(this.groups).fill(1);
    this.ceil = new Float32Array(this.groups).fill(0);
  }

  reset() { this.floor.fill(1); this.ceil.fill(0); this.slowBass = 0; this.pulse = 0; this.onsetCooldown = 0; }

  private layout(n: number) {
    if (n === this.bins) return;
    this.bins = n;
    // Narrow groups at the bottom (where kick / bass / vocal body live), wide at the top.
    const e: number[] = [0];
    for (let g = 1; g <= this.groups; g++) e.push(Math.max(e[g - 1] + 1, Math.round(n * Math.pow(g / this.groups, 2.1))));
    e[this.groups] = n;
    this.edges = e;
  }

  /** Condition `freq` (0..255 bytes) in place. dt = seconds since the last call. */
  apply(freq: Uint8Array | Float32Array, dt: number): BeatState {
    const n = freq.length;
    this.layout(n);
    const d = Math.min(0.25, Math.max(0.001, dt));
    const relax = 1 - Math.exp(-d / this.release);
    const s = this.strength;
    let bassRaw = 0;
    for (let g = 0; g < this.groups; g++) {
      const a = this.edges[g], b = Math.max(a + 1, this.edges[g + 1]);
      let sum = 0, peak = 0;
      for (let i = a; i < b; i++) { const v = freq[i] / 255; sum += v; if (v > peak) peak = v; }
      const level = 0.5 * (sum / (b - a)) + 0.5 * peak;           // peak-weighted so a single strong partial counts
      if (g === 0) bassRaw = level;
      // ceiling jumps up, floor jumps down; both ease back toward the signal
      if (level >= this.ceil[g]) this.ceil[g] = level; else this.ceil[g] += (level - this.ceil[g]) * relax;
      if (level <= this.floor[g]) this.floor[g] = level; else this.floor[g] += (level - this.floor[g]) * relax * 0.6;
      const lo = this.floor[g], range = this.ceil[g] - lo;
      // A group with no real dynamics (a sustained pad, hiss) has nothing to stretch: it passes through
      // as-is. Only the part of the range that actually moves is expanded, so noise is never magnified.
      const span = Math.max(range, 0.02);
      const weight = Math.min(1, range / this.minRange);
      const gate = Math.min(1, level / 0.04);                       // a near-empty group is not amplified
      for (let i = a; i < b; i++) {
        const raw = freq[i] / 255;
        const stretched = Math.min(1, Math.max(0, (raw - lo) / span));
        const target = raw + (stretched - raw) * weight * gate;
        const out = raw + (target - raw) * s;
        freq[i] = Math.round(Math.min(1, Math.max(0, out)) * 255);
      }
    }
    // Beat: a clear rise of the low group over its own recent average. Decays; never "always on".
    this.slowBass += (bassRaw - this.slowBass) * (1 - Math.exp(-d / 0.45));
    this.onsetCooldown = Math.max(0, this.onsetCooldown - d);
    const rise = bassRaw - this.slowBass;
    let onset = false;
    if (rise > 0.06 && this.onsetCooldown === 0 && bassRaw > 0.12) { onset = true; this.pulse = 1; this.onsetCooldown = 0.3; }
    else this.pulse = Math.max(0, this.pulse - d / 0.28);
    return { pulse: this.pulse, onset };
  }
}

// ── operator preference ─────────────────────────────────────────────────────
export type ReactivityMode = 'natural' | 'punchy' | 'max';
export const REACTIVITY_STRENGTH: Record<ReactivityMode, number> = { natural: 0.35, punchy: 0.85, max: 1 };
const KEY = 'ambo_viz_reactivity_v1';
const subs = new Set<() => void>();
function read(): ReactivityMode { try { const v = localStorage.getItem(KEY); if (v === 'natural' || v === 'punchy' || v === 'max') return v; } catch { /* */ } return 'punchy'; }
let mode: ReactivityMode = read();
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) { mode = read(); subs.forEach(f => f()); } });
export const getReactivityMode = () => mode;
export function setReactivityMode(m: ReactivityMode) { mode = m; try { localStorage.setItem(KEY, m); } catch { /* */ } subs.forEach(f => { try { f(); } catch { /* */ } }); }
export const subscribeReactivity = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
