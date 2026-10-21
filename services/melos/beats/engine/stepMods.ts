// Per-hit graph-lane modifiers (Glass graph editor) and their curves — pure, so the scheduler,
// the voice bank, the editor and tests share one definition without pulling in the audio engine.

/** A step's low-pass cutoff + resonance and tail length, applied to that hit's voice only. */
export interface StepMods { cut?: number; res?: number; rel?: number }

/** 0..1 cutoff lane → Hz (40 Hz … ~20 kHz, log). */
export const cutoffHz = (cut01: number) => 40 * Math.pow(2, Math.max(0, Math.min(1, cut01)) * 9);

/** 0..1 tail lane → multiplier on decay/release (0.5 = ×1, 0 = ×¼, 1 = ×4). */
export const tailMul = (rel01: number) => Math.pow(4, (Math.max(0, Math.min(1, rel01)) - 0.5) * 2);
