/**
 * Voca sound effects — tiny synthesized cues (no audio files), deliberately quiet and gentle:
 *  • wordChime  — a very low, soft bell for each word read right (never annoying at reading pace);
 *  • tryAgain   — a soft, warm two-note "mm-hm, once more" dip (NOT a harsh buzz, never scary);
 *  • sentenceChime — a small rising three-note sparkle when a whole sentence is read cleanly;
 *  • celebrate  — a short bright arpeggio + shimmer when the full passage is finished.
 * Everything is routed through one low master gain + a lowpass so nothing is ever shrill, and
 * the volume is capped well under the coach's voice. Mutable via setSfxEnabled (persisted).
 */

const KEY = 'voca.sfx';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
try { enabled = typeof localStorage === 'undefined' || localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked */ }

export const sfxEnabled = () => enabled;
export function setSfxEnabled(on: boolean) { enabled = on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } }

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return null;
    try {
      ctx = new AC();
      const lp = ctx!.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.4;
      master = ctx!.createGain(); master.gain.value = 0.7;
      master.connect(lp); lp.connect(ctx!.destination);
    } catch { ctx = null; return null; }
  }
  if (ctx!.state === 'suspended') void ctx!.resume().catch(() => { /* resumes on the next gesture */ });
  return ctx;
}

/** One soft note: sine/triangle with a quick attack and an exponential tail (no clicks). */
function note(freq: number, at: number, dur: number, peak: number, type: OscillatorType = 'sine', glideTo?: number) {
  const c = ac(); if (!c || !master) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// pentatonic-ish pitches so rapid word chimes always sound pleasant together
const WORD_NOTES = [392.0, 440.0, 523.25, 587.33, 659.25];
let wi = 0;

/** A very low, soft chime for a correct word. */
export function wordChime() {
  if (!enabled) return;
  const f = WORD_NOTES[wi++ % WORD_NOTES.length];
  note(f, 0, 0.22, 0.035);
  note(f * 2, 0, 0.14, 0.008);
}

/** The gentle "try again" cue — a warm falling pair, soft triangle, quiet. */
export function tryAgain() {
  if (!enabled) return;
  note(247, 0, 0.2, 0.045, 'triangle', 215);
  note(196, 0.14, 0.26, 0.04, 'triangle', 180);
}

/** A sentence read cleanly: a small rising sparkle. */
export function sentenceChime() {
  if (!enabled) return;
  [523.25, 659.25, 783.99].forEach((f, k) => { note(f, k * 0.09, 0.3, 0.05); note(f * 2, k * 0.09, 0.18, 0.012); });
}

/** The whole passage is done: a bright arpeggio and a little shimmer. */
export function celebrate() {
  if (!enabled) return;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => { note(f, k * 0.11, 0.5, 0.06); note(f * 1.5, k * 0.11 + 0.03, 0.3, 0.012); });
  [1568, 2093, 2637].forEach((f, k) => note(f, 0.62 + k * 0.07, 0.35, 0.018));
}
