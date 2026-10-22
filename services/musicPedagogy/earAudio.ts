// earAudio.ts — the sound of the Ear Gym and Staff Sprint, synthesised in the browser.
//
// Ear training lives or dies on the tone. A bare oscillator makes every interval sound like a
// test beep and fatigues the ear in minutes, so notes here are a small additive "felt piano":
// a few harmonics with per-partial decay (upper partials die first, like a struck string), a
// soft hammer transient, and a gentle master compressor so chords never clip. Everything is
// scheduled on the AudioContext clock — never setTimeout — so rhythms are sample-accurate.
//
// The second half is a pitch detector for the "Echo" (sing-back) drill: autocorrelation over a
// microphone buffer, good to a few cents on a sung or hummed tone. Poor-pitch singing is usually
// a hearing→voice mapping problem, not "tone deafness" (Pfordresher & Brown 2007), and live
// visual feedback is how that mapping gets trained.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const live = new Set<AudioScheduledSourceNode>();

export function audio(): AudioContext {
  if (!ctx) {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

/** Harmonic recipe: [partial number, relative amplitude, decay seconds]. */
const PARTIALS: [number, number, number][] = [
  [1, 1.0, 2.4], [2, 0.42, 1.5], [3, 0.2, 1.0], [4, 0.12, 0.7], [5, 0.06, 0.5], [6, 0.03, 0.35],
];

/** Play one note at `when` (AudioContext seconds). Returns the time it ends. */
export function note(midi: number, when = 0, dur = 1.2, vel = 0.5): number {
  const ac = audio();
  const t0 = Math.max(when, ac.currentTime + 0.01);
  const f0 = midiToFreq(midi);
  // Lower notes ring longer; very high notes are short and quieter, like a real piano.
  const reg = Math.min(1.6, Math.max(0.55, 1.2 - (midi - 60) / 48));
  const voice = ac.createGain();
  voice.gain.value = vel * 0.32;
  voice.connect(master!);
  for (const [n, amp, decay] of PARTIALS) {
    const f = f0 * n * (1 + 0.0004 * n * n); // a touch of string inharmonicity
    if (f > 12000) continue;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ac.createGain();
    const d = Math.min(dur + 0.6, decay * reg);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.006);
    g.gain.setTargetAtTime(0, t0 + 0.006, d / 3);
    g.gain.setTargetAtTime(0, t0 + dur, 0.08); // key release
    osc.connect(g); g.connect(voice);
    osc.start(t0); osc.stop(t0 + dur + 0.6);
    track(osc);
  }
  // Hammer: 12 ms of filtered noise gives the attack its "felt" edge.
  const len = Math.floor(ac.sampleRate * 0.012);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f0 * 4); bp.Q.value = 0.8;
  const hg = ac.createGain(); hg.gain.value = 0.25;
  src.connect(bp); bp.connect(hg); hg.connect(voice);
  src.start(t0);
  track(src);
  return t0 + dur;
}

/** Simultaneous notes (a tiny 8 ms roll so the chord sounds played, not pasted). */
export function chord(midis: number[], when = 0, dur = 1.6, vel = 0.42): number {
  const ac = audio();
  const t0 = Math.max(when, ac.currentTime + 0.01);
  midis.forEach((m, i) => note(m, t0 + i * 0.008, dur, vel));
  return t0 + dur;
}

/** Notes one after another. `step` is seconds between onsets. */
export function melody(midis: number[], when = 0, step = 0.55, dur = 0.6): number {
  const ac = audio();
  let t = Math.max(when, ac.currentTime + 0.02);
  for (const m of midis) { note(m, t, dur); t += step; }
  return t;
}

/** A sequence of chords — used to set the key (I–IV–V–I) before scale-degree questions. */
export function progression(chords: number[][], when = 0, step = 0.75): number {
  const ac = audio();
  let t = Math.max(when, ac.currentTime + 0.02);
  for (const c of chords) { chord(c, t, step * 0.95, 0.34); t += step; }
  return t;
}

/** A rhythm on one pitch. `beats` are durations in quarter-note beats; negative = rest. */
export function rhythm(beats: number[], bpm = 84, when = 0, midi = 72, countIn = true): number {
  const ac = audio();
  const spb = 60 / bpm;
  let t = Math.max(when, ac.currentTime + 0.05);
  if (countIn) {
    for (let i = 0; i < 4; i++) click(t + i * spb, i === 0);
    t += 4 * spb;
  }
  for (const b of beats) {
    const d = Math.abs(b) * spb;
    if (b > 0) note(midi, t, Math.max(0.08, d * 0.85), 0.55);
    t += d;
  }
  return t;
}

/** Metronome click — a short high blip; the downbeat is brighter. */
export function click(when: number, accent = false): void {
  const ac = audio();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.14, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(g); g.connect(master!);
  osc.start(when); osc.stop(when + 0.06);
  track(osc);
}

function track(n: AudioScheduledSourceNode) {
  live.add(n);
  n.onended = () => live.delete(n);
}

/** Silence everything scheduled (used when the learner hits replay mid-phrase). */
export function stopAll(): void {
  for (const n of live) { try { n.stop(); } catch { /* already stopped */ } }
  live.clear();
}

// ── Pitch detection (sing-back) ───────────────────────────────────────────────

export interface PitchReading { freq: number; midi: number; cents: number; clarity: number }

/**
 * Autocorrelation pitch estimate for one buffer (the "ACF2+" approach: trim silence, find the
 * first dip, take the strongest correlation peak after it, refine with parabolic interpolation).
 * Returns null on silence or noise. Range is clamped to the human singing voice (~65–1100 Hz).
 */
export function detectPitch(buf: Float32Array, sampleRate: number): PitchReading | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.012) return null;

  let r1 = 0, r2 = buf.length - 1;
  const thres = 0.2;
  for (let i = 0; i < buf.length / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < buf.length / 2; i++) if (Math.abs(buf[buf.length - i]) < thres) { r2 = buf.length - i; break; }
  const x = buf.subarray(r1, r2);
  const n = x.length;
  if (n < 256) return null;

  const minLag = Math.floor(sampleRate / 1100);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 65));
  const c = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += x[i] * x[i + lag];
    c[lag] = s;
  }
  let d = 0;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let best = -1, bestLag = -1;
  for (let lag = Math.max(d, minLag); lag <= maxLag; lag++) {
    if (c[lag] > best) { best = c[lag]; bestLag = lag; }
  }
  if (bestLag <= 0 || c[0] <= 0) return null;
  const clarity = best / c[0];
  if (clarity < 0.5) return null;

  const a = c[bestLag - 1], b = c[bestLag], cc = c[bestLag + 1];
  const denom = a - 2 * b + cc;
  const shift = denom !== 0 ? (a - cc) / (2 * denom) : 0;
  const freq = sampleRate / (bestLag + shift);
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  return { freq, midi, cents: Math.round((exact - midi) * 100), clarity };
}

export interface MicHandle { stop: () => void }

/** Open the microphone and stream pitch readings (~30/s) until stop() is called. */
export async function listenPitch(onReading: (r: PitchReading | null) => void): Promise<MicHandle> {
  const ac = audio();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  });
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf = 0;
  let last = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return;
    last = t;
    an.getFloatTimeDomainData(buf);
    onReading(detectPitch(buf, ac.sampleRate));
  };
  raf = requestAnimationFrame(loop);
  return {
    stop: () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      stream.getTracks().forEach(tr => tr.stop());
    },
  };
}
