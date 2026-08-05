// radioFX.ts — the *sound* of the two-way: an intentional AM / ham-radio processing chain plus a
// synthesized Nextel "chirp" (no audio assets). Every received transmission is played through the
// radio chain so it sounds like comms radio; the chirp marks PTT-start / incoming / end-of-talk.
//
// All pure Web Audio. createRadioChain() also works on a live mic stream (self-monitor preview).

// ── Distortion curve (transmitter overdrive) ─────────────────────────────────────
function makeDistortionCurve(amount: number): Float32Array {
  const n = 44100, curve = new Float32Array(n), deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function whiteNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export interface RadioChain {
  input: AudioNode;          // connect your source here
  output: AudioNode;         // connect this to ctx.destination
  setStatic: (level: number) => void;   // 0..~0.05 hiss bed
  dispose: () => void;
}

/**
 * Build the AM/ham comms chain: band-limit 300–3000 Hz → soft-clip distortion → AGC compressor,
 * with a filtered static bed mixed at the output. Wire any source into `.input`.
 */
export function createRadioChain(ctx: BaseAudioContext, staticLevel = 0.014): RadioChain {
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
  const shaper = ctx.createWaveShaper(); shaper.curve = makeDistortionCurve(8); shaper.oversample = '2x';
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -28; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.12;
  const out = ctx.createGain(); out.gain.value = 1;

  hp.connect(lp); lp.connect(shaper); shaper.connect(comp); comp.connect(out);

  // static / hiss bed
  const noise = ctx.createBufferSource(); noise.buffer = whiteNoiseBuffer(ctx); noise.loop = true;
  const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 1800; nbp.Q.value = 0.7;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = staticLevel;
  noise.connect(nbp); nbp.connect(noiseGain); noiseGain.connect(out);
  try { noise.start(); } catch { /* */ }

  return {
    input: hp,
    output: out,
    setStatic: (l) => { noiseGain.gain.value = Math.max(0, l); },
    dispose: () => { try { noise.stop(); } catch { /* */ } [hp, lp, shaper, comp, out, nbp, noiseGain].forEach(n => { try { n.disconnect(); } catch { /* */ } }); },
  };
}

// ── The Nextel chirp (synthesized) ───────────────────────────────────────────────
export type ChirpKind = 'start' | 'incoming' | 'end';

/** Play the Direct-Connect chirp. Approximates the iconic dual-tone warble. */
export function playChirp(ctx: AudioContext, kind: ChirpKind = 'start', volume = 0.18): void {
  const now = ctx.currentTime;
  const master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  // [freq, startOffset, duration] blips
  const blips: Array<[number, number, number]> =
    kind === 'end'      ? [[1245, 0, 0.05], [920, 0.06, 0.08]]
    : kind === 'incoming' ? [[1830, 0, 0.045], [2530, 0.05, 0.05], [1830, 0.105, 0.06]]
    : /* start */          [[2530, 0, 0.045], [1830, 0.05, 0.045], [2530, 0.10, 0.07]];

  for (const [freq, t0, dur] of blips) {
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
    const g = ctx.createGain();
    const s = now + t0;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(1, s + 0.004);
    g.gain.setValueAtTime(1, s + dur - 0.012);
    g.gain.linearRampToValueAtTime(0, s + dur);
    osc.connect(g); g.connect(master);
    osc.start(s); osc.stop(s + dur + 0.02);
  }
}

// ── Play a stored transmission through the radio chain ────────────────────────────
export interface TxPlayback { stop: () => void; readonly audio: HTMLAudioElement }

let sharedCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return sharedCtx;
}

/** Load + play a transmission URL through the AM/ham chain. */
export async function playRadioTransmission(url: string, opts: { onEnded?: () => void; staticLevel?: number; chirpEnd?: boolean } = {}): Promise<TxPlayback> {
  const ctx = getAudioContext();
  await ctx.resume().catch(() => {});
  const audio = new Audio(); audio.crossOrigin = 'anonymous'; audio.src = url;
  const src = ctx.createMediaElementSource(audio);
  const chain = createRadioChain(ctx, opts.staticLevel ?? 0.014);
  src.connect(chain.input); chain.output.connect(ctx.destination);
  audio.addEventListener('ended', () => {
    if (opts.chirpEnd !== false) playChirp(ctx, 'end');
    try { src.disconnect(); } catch { /* */ } chain.dispose();
    opts.onEnded?.();
  }, { once: true });
  await audio.play().catch(() => {});
  return { audio, stop: () => { audio.pause(); try { src.disconnect(); } catch { /* */ } chain.dispose(); } };
}
