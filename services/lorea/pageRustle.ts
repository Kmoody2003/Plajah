// Optional page-turn sound, synthesized with WebAudio (no asset files). OFF unless the reader enables it, and
// it never plays for hidden tabs or reduced-motion turns. Failure (no AudioContext, autoplay policy) is silent.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  } catch { ctx = null; }
  return ctx;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const len = Math.floor(c.sampleRate * 1.2);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let seed = 1234567;                                  // deterministic: same paper every time
  for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
  noise = b; return b;
}

/** 'rustle' = paper (curl / flip), 'swish' = a quieter air sweep (slides, wipes, cards). */
export function playPageSound(kind: 'rustle' | 'swish', durationMs: number, volume = 0.5): void {
  try {
    if (typeof document !== 'undefined' && document.hidden) return;
    const c = ac(); if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    const t0 = c.currentTime + 0.005;
    const dur = Math.max(0.12, Math.min(1.1, durationMs / 1000));
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    const g = c.createGain();
    const peak = (kind === 'rustle' ? 0.16 : 0.07) * Math.max(0, Math.min(1, volume));
    if (kind === 'rustle') {
      bp.Q.value = 0.9; bp.frequency.setValueAtTime(2400, t0); bp.frequency.exponentialRampToValueAtTime(5200, t0 + dur * 0.55); bp.frequency.exponentialRampToValueAtTime(3000, t0 + dur);
      // A few crackle bumps instead of one smooth swell: that is what paper sounds like.
      g.gain.setValueAtTime(0.0001, t0);
      const bumps = [0.08, 0.22, 0.38, 0.55, 0.72]; const amp = [0.5, 1, 0.65, 0.9, 0.35];
      bumps.forEach((b, i) => { const t = t0 + dur * b; g.gain.linearRampToValueAtTime(peak * amp[i], t); g.gain.linearRampToValueAtTime(peak * amp[i] * 0.25, t + dur * 0.06); });
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    } else {
      bp.Q.value = 0.5; bp.frequency.setValueAtTime(700, t0); bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t0, Math.random() * 0.4, dur + 0.05);
    src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* already gone */ } };
  } catch { /* sound is a nicety, never an error */ }
}
