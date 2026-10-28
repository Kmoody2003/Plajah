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
    const g = 1 + k * 0.35;
    for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(x * g) / Math.tanh(g); }
    curves.set(k, c);
  }
  return c;
}
function crushCurve(steps: number): Float32Array {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}

/** Output trims per engine/model, measured from offline renders: body drums peak near 0.8,
 *  claps a little under, hats and shakers lower — about where a kit sits before mixing. */
const TRIM: Record<string, number> = {
  'snare/analog': 0.75, 'snare/acoustic': 0.95, 'snare/bit': 0.87, 'snare/metal': 0.98,
  'hat/metal': 2.8, 'hat/noise': 1.6, 'hat/hybrid': 4.5,
  'tom/analog': 1.04, 'tom/acoustic': 0.68, 'tom/fm': 1.04,
  'perc/fm': 1.5, 'perc/membrane': 0.65, 'perc/shaker': 1.1,
  'clap/analog': 4.1, 'clap/room': 5.0,
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
    const ws = ctx.createWaveShaper(); ws.curve = driveCurve(Math.min(1, drive)) as Float32Array<ArrayBuffer>; ws.oversample = '2x';
    head.connect(ws); head = ws;
  }
  if (patch.model === 'bit') {
    const ws = ctx.createWaveShaper(); ws.curve = crushCurve(12) as Float32Array<ArrayBuffer>;
    head.connect(ws); head = ws;
  }
  head.connect(dest);
  let end = t + 0.1;

  switch (patch.engine) {
    case 'kick': {
      const f = P('tune') * tune;
      const dec = patch.model === 'sub' ? Math.max(P('decay'), Math.min(srcSec, 30)) : P('decay');
      const body = osc(ctx, patch.model === 'dusty' ? 'triangle' : 'sine', t, dec);
      sweep(body.frequency, t, f, P('pitchAmt'), P('pitchDecay'));
      if (patch.model === 'fm' || (P('fm') > 0.01 && patch.model !== 'sub')) {
        // FM: a modulator at 1.5× drives the body's frequency, decaying faster than the body.
        const depth = (patch.model === 'fm' ? 0.4 + P('fm') : P('fm') * 0.5) * f * 3;
        const mod = osc(ctx, 'sine', t, dec);
        mod.frequency.setValueAtTime(f * 1.5, t);
        const mg = envGain(ctx, t, depth, dec * 0.4);
        mod.connect(mg).connect(body.frequency);
      }
      // Tone: a low-pass that opens the body's upper harmonics (after drive).
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(150 + Math.pow(P('tone'), 2) * 9000, t);
      body.connect(envGain(ctx, t, 0.95 * level, dec)).connect(lp).connect(bus);
      if (patch.model === 'acoustic') {
        // A second membrane mode (inharmonic) and a felt-beater thump.
        const m2 = osc(ctx, 'sine', t, dec * 0.5);
        sweep(m2.frequency, t, f * 1.59, P('pitchAmt') * 0.5, P('pitchDecay'));
        m2.connect(envGain(ctx, t, 0.25 * level, dec * 0.35)).connect(lp);
        const thump = ctx.createBiquadFilter(); thump.type = 'lowpass'; thump.frequency.value = 900;
        noiseSrc(ctx, t, 0.05).connect(thump).connect(envGain(ctx, t, 0.35 * level, 0.03)).connect(bus);
      }
      const click = P('click');
      if (click > 0.01) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.8;
        noiseSrc(ctx, t, 0.02).connect(bp).connect(envGain(ctx, t, click * 0.5 * level, 0.012)).connect(bus);
      }
      const nz = P('noise') + (patch.model === 'dusty' ? 0.08 : 0);
      if (nz > 0.01) {
        const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 2500;
        noiseSrc(ctx, t, dec).connect(bp).connect(envGain(ctx, t, nz * 0.25 * level, dec * 0.6)).connect(bus);
      }
      end = t + dec;
      break;
    }
    case 'tom': {
      const f = P('tune') * tune, dec = P('decay');
      const body = osc(ctx, 'sine', t, dec);
      sweep(body.frequency, t, f, P('pitchAmt'), P('pitchDecay'));
      if (patch.model === 'fm' || P('fm') > 0.01) {
        const mod = osc(ctx, 'sine', t, dec);
        mod.frequency.setValueAtTime(f * (patch.model === 'fm' ? 2.41 : 1.5), t);
        mod.connect(envGain(ctx, t, (patch.model === 'fm' ? 0.5 + P('fm') : P('fm') * 0.4) * f * 2, dec * 0.5)).connect(body.frequency);
      }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300 + Math.pow(P('tone'), 2) * 8000;
      body.connect(envGain(ctx, t, 0.85 * level, dec)).connect(lp).connect(bus);
      if (patch.model === 'acoustic') {
        for (const [r, g] of [[1.59, 0.3], [2.14, 0.15]] as const) {
          const m = osc(ctx, 'sine', t, dec * 0.6);
          sweep(m.frequency, t, f * r, P('pitchAmt') * 0.6, P('pitchDecay'));
          m.connect(envGain(ctx, t, g * level, dec * 0.5)).connect(lp);
        }
      }
      const skin = P('noise');
      if (skin > 0.01) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 6; bp.Q.value = 0.9;
        noiseSrc(ctx, t, 0.15).connect(bp).connect(envGain(ctx, t, skin * 0.4 * level, 0.08)).connect(bus);
      }
      end = t + dec;
      break;
    }
    case 'snare': {
      const f = P('tune') * tune, dec = P('decay'), ndec = P('noiseDecay'), mix = P('mix');
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000 + Math.pow(P('tone'), 2) * 14000;
      lp.connect(bus);
      // Body: two tuned oscillators (metal = more partials, ringing).
      const ratios = patch.model === 'metal' ? [1, P('detune'), 2.3, 3.1] : [1, P('detune')];
      ratios.forEach((r, k) => {
        const o = osc(ctx, patch.model === 'metal' ? 'square' : 'sine', t, dec * (patch.model === 'metal' ? 2 : 1));
        sweep(o.frequency, t, f * r, P('pitchAmt'), 0.012);
        const g = (k === 0 ? 0.6 : 0.35) * (1 - mix * 0.5) * level * (patch.model === 'metal' ? 0.35 : 1);
        o.connect(envGain(ctx, t, g, dec * (patch.model === 'metal' ? 2 : 1) * (k === 0 ? 1 : 0.7))).connect(lp);
      });
      // Wires: band-limited noise (acoustic = brighter, longer, more hiss).
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = patch.model === 'acoustic' ? 1800 : 1200;
      const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = patch.model === 'acoustic' ? 5500 : 3500; bp.gain.value = 6;
      noiseSrc(ctx, t, ndec).connect(hp).connect(bp).connect(envGain(ctx, t, mix * 0.7 * level, ndec)).connect(lp);
      const snap = P('snap');
      if (snap > 0.01) {
        const sh = ctx.createBiquadFilter(); sh.type = 'highpass'; sh.frequency.value = 3000;
        noiseSrc(ctx, t, 0.02).connect(sh).connect(envGain(ctx, t, snap * 0.6 * level, 0.008)).connect(bus);
      }
      end = t + Math.max(dec, ndec);
      break;
    }
    case 'hat': {
      const dec = P('decay'), tone = P('tone'), mix = patch.model === 'noise' ? 1 : patch.model === 'hybrid' ? Math.max(0.3, P('mix')) : P('mix') * 0.5;
      const att = P('attack');
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000 + tone * 4000;
      const out = envGain(ctx, t, 0.45 * level, dec, att);
      hp.connect(out).connect(bus);
      if (patch.model !== 'noise') {
        // Six square oscillators at cymbal ratios through a resonant band-pass ("Ring").
        const base = 205 * Math.pow(2, P('tune') / 12) * tune;
        const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = 9000 + tone * 3000; bpf.Q.value = 0.6 + P('ring') * 4;
        const mg = ctx.createGain(); mg.gain.value = (1 - mix) * 0.35;
        for (const r of METAL_RATIOS) { const o = osc(ctx, 'square', t, dec + att); o.frequency.value = base * r * 1.83; o.connect(mg); }
        mg.connect(bpf).connect(hp);
      }
      if (mix > 0.01) {
        const ng = ctx.createGain(); ng.gain.value = mix * 0.6;
        noiseSrc(ctx, t, dec + att).connect(ng).connect(hp);
      }
      end = t + att + dec;
      break;
    }
    case 'perc': {
      const f = P('tune') * tune, dec = P('decay'), att = P('attack');
      if (patch.model === 'shaker') {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4000 + P('tone') * 6000; bp.Q.value = 1.2;
        noiseSrc(ctx, t, dec + att).connect(bp).connect(envGain(ctx, t, 0.6 * level, dec, Math.max(0.004, att))).connect(bus);
      } else if (patch.model === 'membrane') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800 + Math.pow(P('tone'), 2) * 9000; lp.connect(bus);
        for (const [r, g, d] of [[1, 0.7, 1], [1.59, 0.35, 0.6], [2.14, 0.22, 0.45], [2.65, 0.12, 0.3]] as const) {
          const o = osc(ctx, 'sine', t, dec * d);
          sweep(o.frequency, t, f * r, P('pitchAmt'), 0.02);
          o.connect(envGain(ctx, t, g * level, dec * d, att)).connect(lp);
        }
      } else {
        // Two-operator FM: modulator at `ratio`, index decays faster than the carrier (bells, blips).
        const car = osc(ctx, 'sine', t, dec);
        sweep(car.frequency, t, f, P('pitchAmt'), 0.015);
        const mod = osc(ctx, 'sine', t, dec);
        mod.frequency.setValueAtTime(f * P('ratio'), t);
        mod.connect(envGain(ctx, t, P('fm') * f * 4, dec * 0.6)).connect(car.frequency);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500 + Math.pow(P('tone'), 2) * 14000;
        car.connect(envGain(ctx, t, 0.6 * level, dec, att)).connect(lp).connect(bus);
      }
      end = t + att + dec;
      break;
    }
    case 'clap': {
      const dec = P('decay'), spread = P('spread'), n = Math.round(P('bursts'));
      const room = patch.model === 'room';
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = P('tune') * tune; bp.Q.value = 0.6 + (1 - P('q')) * 2.4;
      bp.connect(bus);
      for (let i = 0; i < n; i++) {
        const at = t + i * spread * (room ? 1 + Math.random() * 0.6 : 1);
        noiseSrc(ctx, at, 0.03).connect(envGain(ctx, at, 0.5 * level, 0.012)).connect(bp);
      }
      const tailAt = t + n * spread;
      noiseSrc(ctx, tailAt, dec * (room ? 1.6 : 1)).connect(envGain(ctx, tailAt, 0.45 * level, dec * (room ? 1.6 : 1))).connect(bp);
      end = tailAt + dec * (room ? 1.6 : 1);
      break;
    }
  }
  return { stopAt: end + 0.05 };
}
