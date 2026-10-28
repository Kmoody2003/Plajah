// MEKA Drum Synth DSP — one hit of a DrumSynthPatch (drumSynth.ts) as Web Audio nodes at time
// `t`, into `dest` (the pad's voice gain). Context-agnostic like synthVoices.ts, so the live
// engine and the offline bounce sound the same. The pad's outer AHDSR still shapes the hit;
// these voices carry their own natural decay, the way a drum synth's amp envelope does.

import { dsParam, type DrumSynthPatch } from '../drumSynth';
import type { SynthHit } from './synthVoices';

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Exponential amp envelope on a new gain node: instant attack (or `attack` s), decay to silence. */
function envGain(ctx: BaseAudioContext, t: number, level: number, decay: number, attack = 0): GainNode {
  const g = ctx.createGain();
  const peak = Math.max(0.0002, level);
  if (attack > 0.0005) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); }
  else g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.005, decay));
  return g;
}

function noiseSrc(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, t: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** Pitch sweep from f·2^(amt/12) down to f over `dec` seconds (exponential, like an analog kick). */
function sweep(p: AudioParam, t: number, f: number, amt: number, dec: number) {
  p.setValueAtTime(Math.max(20, f * Math.pow(2, amt / 12)), t);
  p.exponentialRampToValueAtTime(Math.max(20, f), t + Math.max(0.002, dec) * 3);
}

/** Soft clip; amount 0..1. Curves are cached per amount step. */
const curves = new Map<number, Float32Array>();
function driveCurve(amount: number): Float32Array {
  const k = Math.round(amount * 20);
  let c = curves.get(k);
  if (!c) {
    c = new Float32Array(1024);
    // Gain grows with the square of the knob (warmth low, grit at the top), and a small DC bias
    // makes the clipping asymmetric — even harmonics, the "dirt" of an overdriven drum machine.
    const g = 1 + k * k * 0.2;
    const b = ((k / 20) * 0.35) / g; // bias in units of the knee, so it tilts but never parks in saturation
    const off = Math.tanh(g * b);
    let peak = 1e-6;
    for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(g * (x + b)) - off; peak = Math.max(peak, Math.abs(c[i])); }
    for (let i = 0; i < c.length; i++) c[i] /= peak;
    curves.set(k, c);
  }
  return c;
}
/** Make-up gain so a -12 dB sine comes out of the drive curve at the level it went in (its AC
 *  RMS, so the asymmetry's DC offset doesn't count as loudness). */
const comps = new Map<number, number>();
function driveComp(amount: number): number {
  const k = Math.round(amount * 20);
  let m = comps.get(k);
  if (m === undefined) {
    const c = driveCurve(amount), n = 256, vals: number[] = [];
    for (let i = 0; i < n; i++) { const x = 0.25 * Math.sin((2 * Math.PI * i) / n); vals.push(c[Math.round(((x + 1) / 2) * (c.length - 1))]); }
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const rms = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
    m = (0.25 / Math.SQRT2) / Math.max(1e-4, rms);
    comps.set(k, m);
  }
  return m;
}
function crushCurve(steps: number): Float32Array {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}

/** Output trims per engine/model, measured from offline renders: body drums peak near 0.8,
 *  claps a little under, hats and shakers lower — about where a kit sits before mixing. */
const TRIM: Record<string, number> = {
  'kick/analog': 1.14, 'kick/sub': 1.18, 'kick/dusty': 1.27, 'kick/fm': 1.18, 'kick/acoustic': 0.94,
  'snare/analog': 0.44, 'snare/acoustic': 0.51, 'snare/bit': 0.85, 'snare/metal': 0.37,
  'hat/metal': 0.54, 'hat/noise': 0.62, 'hat/hybrid': 0.79,
  'tom/analog': 1.02, 'tom/acoustic': 0.65, 'tom/fm': 0.95,
  'perc/fm': 1.17, 'perc/membrane': 0.54, 'perc/shaker': 1.04,
  'clap/analog': 4.64, 'clap/room': 3.67,
};

/** Ratios of the 808 hat's six square oscillators (to the lowest one). */
const METAL_RATIOS = [1, 1.4823, 1.8007, 2.5459, 2.6304, 3.8963];

export function playDrumSynth(
  ctx: BaseAudioContext, dest: AudioNode, patch: DrumSynthPatch, t: number, vel: number, pitchSemis = 0, srcSec = 1,
): SynthHit {
  const P = (id: string) => dsParam(patch, id);
  const v = Math.max(0.05, Math.min(1, vel));
  const tune = Math.pow(2, (pitchSemis || 0) / 12);
  const level = Math.pow(10, P('level') / 20) * v * (TRIM[`${patch.engine}/${patch.model}`] ?? 1);
  // Every voice ends in one bus: tone filter → drive → dest.
  const bus = ctx.createGain();
  let head: AudioNode = bus;
  const drive = patch.engine === 'kick' || patch.engine === 'snare' ? P('drive') + (patch.model === 'dusty' ? 0.35 : 0) : 0;
  if (drive > 0.02) {
    // A WaveShaper clamps its input to ±1 — feed it at -12 dB so layered hits saturate smoothly
    // instead of hard-clipping (which also swallowed the click), and make the level back after.
    const pre = ctx.createGain(); pre.gain.value = 0.25;
    const ws = ctx.createWaveShaper(); ws.curve = driveCurve(Math.min(1, drive)) as Float32Array<ArrayBuffer>; ws.oversample = '2x';
    // Hold the level roughly steady across the knob, so Drive changes character more than volume.
    const post = ctx.createGain(); post.gain.value = (driveComp(Math.min(1, drive)) / pre.gain.value) * 0.8;
    head.connect(pre).connect(ws).connect(post); head = post;
  }
  if (patch.model === 'bit') {
    const ws = ctx.createWaveShaper(); ws.curve = crushCurve(12) as Float32Array<ArrayBuffer>;
    head.connect(ws); head = ws;
  }
  head.connect(dest);
  let end = t + 0.1;

  // Velocity also opens the tone, the way a harder hit is brighter on a real drum synth.
  const velTone = 0.55 + 0.45 * v;

  /** Body oscillator with a harmonic layer: Tone crossfades a pure sine toward a saw (square for
   *  Dusty) and opens the low-pass on it, so Tone is audible even on a sine-based drum. */
  const body = (f: number, amt: number, pdec: number, dec: number, gain: number, into: AudioNode, harmType: OscillatorType = 'sawtooth'): OscillatorNode[] => {
    const tone = P('tone');
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(18000, (250 + tone * tone * 9000) * velTone), t);
    lp.Q.value = 0.7 + tone * 1.5;
    lp.connect(into);
    const sine = osc(ctx, 'sine', t, dec);
    sweep(sine.frequency, t, f, amt, pdec);
    sine.connect(envGain(ctx, t, gain * (1 - 0.55 * tone), dec)).connect(lp);
    const harm = osc(ctx, harmType, t, dec);
    sweep(harm.frequency, t, f, amt, pdec);
    harm.connect(envGain(ctx, t, gain * tone * 0.8, dec * 0.8)).connect(lp);
    return [sine, harm];
  };
  /** FM onto oscillators' frequency: depth in Hz = index × modulator frequency. */
  const fmInto = (targets: OscillatorNode[], modHz: number, index: number, dec: number) => {
    if (index < 0.01) return;
    const mod = osc(ctx, 'sine', t, dec);
    mod.frequency.setValueAtTime(modHz, t);
    const g = envGain(ctx, t, index * modHz, dec);
    mod.connect(g);
    for (const o of targets) g.connect(o.frequency);
  };

  switch (patch.engine) {
    case 'kick': {
      const f = P('tune') * tune;
      const dec = patch.model === 'sub' ? Math.max(P('decay'), Math.min(srcSec, 30)) : P('decay');
      const oscs = body(f, P('pitchAmt'), P('pitchDecay'), dec, 0.95 * level, bus, patch.model === 'dusty' ? 'square' : 'sawtooth');
      if (patch.model !== 'sub') fmInto(oscs, f * 1.5, patch.model === 'fm' ? 1 + P('fm') * 8 : P('fm') * 6, dec * 0.45);
      if (patch.model === 'acoustic') {
        // A second membrane mode (inharmonic) and a felt-beater thump.
        const m2 = osc(ctx, 'sine', t, dec * 0.5);
        sweep(m2.frequency, t, f * 1.59, P('pitchAmt') * 0.5, P('pitchDecay'));
        m2.connect(envGain(ctx, t, 0.3 * level, dec * 0.35)).connect(bus);
        const thump = ctx.createBiquadFilter(); thump.type = 'lowpass'; thump.frequency.value = 900;
        noiseSrc(ctx, t, 0.05).connect(thump).connect(envGain(ctx, t, 0.4 * level, 0.03)).connect(bus);
      }
      const click = P('click') * v;
      if (click > 0.01) {
        // Beater: a band of noise plus a fast falling blip; Click sets level AND length.
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3500; bp.Q.value = 0.7;
        noiseSrc(ctx, t, 0.03).connect(bp).connect(envGain(ctx, t, click * 1.4 * level, 0.006 + click * 0.014)).connect(bus);
        const blip = osc(ctx, 'sine', t, 0.02);
        blip.frequency.setValueAtTime(2600, t); blip.frequency.exponentialRampToValueAtTime(700, t + 0.008);
        blip.connect(envGain(ctx, t, click * 0.7 * level, 0.008)).connect(bus);
      }
      const nz = P('noise') + (patch.model === 'dusty' ? 0.08 : 0);
      if (nz > 0.01) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500 + P('tone') * 5000;
        noiseSrc(ctx, t, dec).connect(lp).connect(envGain(ctx, t, nz * 1.5 * level, dec * 0.6)).connect(bus);
      }
      end = t + dec;
      break;
    }
    case 'tom': {
      const f = P('tune') * tune, dec = P('decay');
      const oscs = body(f, P('pitchAmt'), P('pitchDecay'), dec, 0.85 * level, bus);
      fmInto(oscs, f * (patch.model === 'fm' ? 2.41 : 1.5), patch.model === 'fm' ? 1 + P('fm') * 7 : P('fm') * 6, dec * 0.5);
      if (patch.model === 'acoustic') {
        for (const [r, g] of [[1.59, 0.35], [2.14, 0.2]] as const) {
          const m = osc(ctx, 'sine', t, dec * 0.6);
          sweep(m.frequency, t, f * r, P('pitchAmt') * 0.6, P('pitchDecay'));
          m.connect(envGain(ctx, t, g * level, dec * 0.5)).connect(bus);
        }
      }
      const skin = P('noise');
      if (skin > 0.01) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 5); bp.Q.value = 0.7;
        noiseSrc(ctx, t, 0.2).connect(bp).connect(envGain(ctx, t, skin * 1.1 * level, 0.04 + skin * 0.12)).connect(bus);
      }
      end = t + dec;
      break;
    }
    case 'snare': {
      const f = P('tune') * tune, dec = P('decay'), ndec = P('noiseDecay'), mix = P('mix'), tone = P('tone');
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, (1500 + tone * tone * 15000) * velTone);
      lp.connect(bus);
      // Body: two tuned oscillators (metal = more partials, ringing). Snares crossfades body and wires.
      const metal = patch.model === 'metal';
      const ratios = metal ? [1, P('detune'), 2.3, 3.1] : [1, P('detune')];
      ratios.forEach((r, k) => {
        const o = osc(ctx, metal ? 'square' : 'triangle', t, dec * (metal ? 2 : 1));
        // Snap also kicks the body's pitch for the first few ms — the stick's crack.
        sweep(o.frequency, t, f * r, P('pitchAmt') + P('snap') * 18, 0.006 + 0.02 * (1 - P('snap')));
        const g = (k === 0 ? 1 : 0.9) * (1 - mix * 0.85) * level * (metal ? 0.35 : 1);
        o.connect(envGain(ctx, t, g, dec * (metal ? 2 : 1))).connect(lp);
      });
      // Wires: band-limited noise; Tone also thins their low end.
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = (patch.model === 'acoustic' ? 1200 : 700) + tone * 2200;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = (patch.model === 'acoustic' ? 4000 : 2500) + tone * 5000; pk.gain.value = 8;
      noiseSrc(ctx, t, ndec).connect(hp).connect(pk).connect(envGain(ctx, t, mix * 0.9 * level, ndec)).connect(lp);
      const snap = P('snap') * v;
      if (snap > 0.01) {
        const sh = ctx.createBiquadFilter(); sh.type = 'highpass'; sh.frequency.value = 2500;
        noiseSrc(ctx, t, 0.04).connect(sh).connect(envGain(ctx, t, snap * 2.2 * level, 0.004 + snap * 0.03)).connect(bus);
      }
      end = t + Math.max(dec, ndec);
      break;
    }
    case 'hat': {
      const dec = P('decay'), tone = P('tone'), ring = P('ring'), att = P('attack');
      const mix = patch.model === 'noise' ? 1 : patch.model === 'hybrid' ? 0.3 + P('mix') * 0.7 : P('mix') * 0.85;
      // Tune moves the whole hat: the oscillators AND the filters that voice them.
      const tr = Math.pow(2, P('tune') / 12) * tune;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = Math.min(15000, (3000 + tone * 7000) * Math.min(2, Math.max(0.5, tr)) * velTone);
      hp.connect(bus);
      if (patch.model !== 'noise') {
        // Six square oscillators at cymbal ratios through a resonant band-pass. Ring = resonance
        // and how long the metal sings past the noise.
        const base = 205 * tr;
        const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
        bpf.frequency.value = Math.min(16000, (7000 + tone * 5000) * tr); bpf.Q.value = 0.5 + ring * ring * 14;
        // A narrower band passes less energy — make it back so Ring changes the colour, not the level.
        const mg = envGain(ctx, t, (1 - mix) * 0.9 * level * Math.sqrt(bpf.Q.value) * 0.6, dec * (1 + ring * 2.5), att);
        for (const r of METAL_RATIOS) { const o = osc(ctx, 'square', t, dec * 2.5 + att); o.frequency.value = base * r * 1.83; o.connect(mg); }
        mg.connect(bpf).connect(hp);
      }
      if (mix > 0.01) noiseSrc(ctx, t, dec + att).connect(envGain(ctx, t, mix * 0.6 * level, dec, att)).connect(hp);
      end = t + att + dec * (patch.model === 'noise' ? 1 : 1 + ring * 2.5);
      break;
    }
    case 'perc': {
      const f = P('tune') * tune, dec = P('decay'), att = P('attack'), tone = P('tone');
      if (patch.model === 'shaker') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = (2500 + tone * 9000) * velTone; bp.Q.value = 0.8 + tone * 2;
        noiseSrc(ctx, t, dec + att).connect(bp).connect(envGain(ctx, t, 0.6 * level, dec, Math.max(0.004, att))).connect(bus);
      } else if (patch.model === 'membrane') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (500 + tone * tone * 10000) * velTone; lp.connect(bus);
        for (const [r, g, d] of [[1, 0.7, 1], [1.59, 0.45, 0.6], [2.14, 0.3, 0.45], [2.65, 0.2, 0.3]] as const) {
          const o = osc(ctx, 'sine', t, dec * d);
          sweep(o.frequency, t, f * r, P('pitchAmt'), 0.02);
          o.connect(envGain(ctx, t, g * level, dec * d, att)).connect(lp);
        }
      } else {
        // Two-operator FM: modulator at Ratio, index (FM) decaying faster than the carrier.
        const car = osc(ctx, 'sine', t, dec);
        sweep(car.frequency, t, f, P('pitchAmt'), 0.015);
        fmInto([car], f * P('ratio'), P('fm') * 6 * (0.4 + tone * 1.2), dec * 0.6); // Tone brightens the FM too
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(18000, (400 + tone * tone * 12000) * velTone);
        car.connect(envGain(ctx, t, 0.6 * level, dec, att)).connect(lp).connect(bus);
      }
      end = t + att + dec;
      break;
    }
    case 'clap': {
      const dec = P('decay'), spread = P('spread'), n = Math.round(P('bursts'));
      const room = patch.model === 'room';
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = P('tune') * tune; bp.Q.value = 0.5 + (1 - P('q')) * 4;
      bp.connect(bus);
      // Distinct hand claps: each burst is short and loud, so Bursts and Spread are heard.
      for (let i = 0; i < n; i++) {
        const at = t + i * spread * (room ? 1 + Math.random() * 0.6 : 1);
        noiseSrc(ctx, at, 0.02).connect(envGain(ctx, at, 0.9 * level, 0.007)).connect(bp);
      }
      const tailAt = t + Math.max(0, n - 1) * spread + 0.004;
      noiseSrc(ctx, tailAt, dec * (room ? 1.6 : 1)).connect(envGain(ctx, tailAt, 0.4 * level, dec * (room ? 1.6 : 1))).connect(bp);
      end = tailAt + dec * (room ? 1.6 : 1);
      break;
    }
  }
  return { stopAt: end + 0.05 };
}
