// Live sound tuning for The Endless Hour.
//
// A synth is finished in the ear, not in a commit — so these knobs are a MUTABLE in-memory singleton
// the engine reads on the fly, plus a version counter so consumers re-apply only when something
// actually changed. The admin panel writes to it live (the preview engine runs in the same tab, so
// a slider is heard immediately) and persists it into the channel config on Save, after which every
// viewer loads the same values.
//
// Keep every field 0..1 so the UI is uniform and nothing can be set to an unsafe value.

export interface SoundTuning {
  /** Overall channel level (into the limiter). */
  master: number;
  /** Low-mid body / fundamental warmth. */
  warmth: number;
  /** High-end ceiling — the whine control. Lower = darker/softer. */
  brightness: number;
  /** Reverb (Veil) amount. */
  reverb: number;
  /** Delay/echo wet. */
  delay: number;

  /** Legacy split-pad controls retained for older saved configs. The current CPU-safe instrument
   *  shares one polyphonic voice for pad + melody, controlled by the lead values below. */
  padLevel: number;
  padCutoff: number;
  padAttack: number;

  /** The ONDA lead the composer plays. */
  leadLevel: number;
  leadCutoff: number;
  leadAttack: number;

  /** How present the composed melody is. */
  melody: number;
  /** How present the flowing 80s synth arpeggio is (0 = off, no worklet). */
  arp: number;
  /** How present the arpeggiated bassline is (0 = off). */
  bass: number;
  /** The soft kick — audible but gentle (0 = off, no worklet). */
  kick: number;
  /** The bright modal bells — sparing accents (scales the VELA voice level). */
  bells: number;
}

export const DEFAULT_TUNING: SoundTuning = {
  master: 1,
  warmth: 0.55,
  brightness: 0.32,
  reverb: 0.5,
  delay: 0.4,
  padLevel: 0.6,
  padCutoff: 0.42,
  padAttack: 0.55,
  leadLevel: 0.78,
  leadCutoff: 0.5,
  leadAttack: 0.32,
  melody: 0.8,
  arp: 0.78,
  bass: 0.74,
  kick: 0.65,
  bells: 0.12, // an accent behind the composed music, never the foreground
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

let current: SoundTuning = { ...DEFAULT_TUNING };
let version = 0;

/** The live values the engine reads. */
export const getTuning = (): SoundTuning => current;

/** Bumps whenever tuning changes, so the engine re-applies patch params only on a real change. */
export const tuningVersion = (): number => version;

/** Live update (from a slider). Clamps every field. */
export function setTuning(patch: Partial<SoundTuning>): void {
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && Number.isFinite(v)) (next as Record<string, number>)[k] = clamp01(v);
  }
  current = next;
  version++;
}

/** Replace wholesale (e.g. from the persisted config on load), filling any missing field with the
 *  default so an older saved config still works. */
export function loadTuning(t?: Partial<SoundTuning> | null): void {
  current = { ...DEFAULT_TUNING, ...(t ?? {}) };
  version++;
}
