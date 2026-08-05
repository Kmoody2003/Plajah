// ─────────────────────────────────────────────────────────────────────────
// Intimate sound FX — soft, synthesized Web Audio cues for couples chat.
// No audio assets (pure oscillators/envelopes), same approach as the walkie
// radioFX chirps. Cheap, instant, and only invoked from intimate surfaces.
// ─────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) { const AC = window.AudioContext || (window as any).webkitAudioContext; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

/** One soft sine "bell" note with a quick exponential decay. */
function bell(freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(env); env.connect(c.destination);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Gentle rising two-note chime when a message is sent. */
export function playSendChime() {
  bell(660, 0, 0.18, 0.12);
  bell(880, 0.05, 0.22, 0.10);
}

/** Soft "received" note. */
export function playReceiveChime() {
  bell(523.25, 0, 0.22, 0.09);
}

/** Sparkly ascending shimmer when a gift is opened. */
export function playGiftChime() {
  [587.33, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, i * 0.07, 0.3, 0.09, 'triangle'));
}

/** Tiny warm pop for a sent heart/emote. */
export function playHeartPop() {
  bell(392, 0, 0.14, 0.11);
  bell(523.25, 0.04, 0.16, 0.09);
}
