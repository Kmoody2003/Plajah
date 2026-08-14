// Melos Beats — synthesized starter voices, so a brand-new groove makes sound with zero content.
// Recipes adapted from services/instrumentSynth.ts (playHit's body-sine + bandpassed-noise-crack
// design, :187) tightened for drum-machine duty. Every voice writes into `dest` (the pad strip
// input) at absolute time `t` — context-agnostic so live and offline renders sound identical.

import type { SynthVoiceId } from '../grooveDoc';

export interface SynthHit { stopAt: number } // scheduler uses this to bound voice lifetime

function noise(ctx: BaseAudioContext, seconds: number, shape: (i: number, n: number) => number): AudioBuffer {
  const len = Math.max(64, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * shape(i, len);
  return buf;
}

function bodySine(ctx: BaseAudioContext, dest: AudioNode, t: number, fromHz: number, toHz: number, level: number, decay: number) {
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(fromHz, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 25), t + decay * 0.75);
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(g).connect(dest);
  osc.start(t); osc.stop(t + decay + 0.05);
}

function crack(ctx: BaseAudioContext, dest: AudioNode, t: number, centerHz: number, q: number, level: number, decay: number, type: BiquadFilterType = 'bandpass') {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, Math.min(decay, 0.6), (i, n) => Math.pow(1 - i / n, 2));
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = centerHz; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + decay + 0.05);
}

// vel is 0..1 AFTER the pad's velocity curve; pitch in semitones shifts the voice's tuning.
// srcSec = how long the SOURCE material must keep sounding — the caller's AHDSR envelope on the
// outer voice gain does the audible shaping, so sustainable voices (sub) just have to not die
// early. One-shot voices (kick/snare/clap/hats) keep their natural internal length.
export function playSynthVoice(
  ctx: BaseAudioContext, dest: AudioNode, voice: SynthVoiceId, t: number, vel: number, pitchSemis = 0, srcSec = 1,
): SynthHit {
  const tune = Math.pow(2, (pitchSemis || 0) / 12);
  const v = Math.max(0.05, Math.min(1, vel));
  switch (voice) {
    case 'kick': {
      // 808-style: fast 160→45Hz sweep + a click for the beater.
      bodySine(ctx, dest, t, 160 * tune, 45 * tune, 0.9 * v, 0.42);
      crack(ctx, dest, t, 3400, 0.7, 0.12 * v, 0.03);
      return { stopAt: t + 0.5 };
    }
    case 'sub': {
      // Sustainable 808 sub: a short pitch-drop into a steady fundamental that runs for as long
      // as the envelope needs it (held pad, legato-gated step, or drawn note). The outer AHDSR
      // does the shaping; this source only fades in its last 30ms as a safety edge.
      const dur = Math.max(0.25, Math.min(srcSec, 30));
      const osc = ctx.createOscillator(); osc.type = 'sine';
      const f = 52 * tune;
      osc.frequency.setValueAtTime(f * 1.6, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(f, 20), t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85 * v, t);
      g.gain.setValueAtTime(0.85 * v, t + dur - 0.03);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      // A touch of second harmonic so it reads on small speakers.
      const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = f * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.12 * v;
      osc.connect(g).connect(dest);
      osc2.connect(g2).connect(g);
      osc.start(t); osc.stop(t + dur + 0.05);
      osc2.start(t); osc2.stop(t + dur + 0.05);
      return { stopAt: t + dur };
    }
    case 'snare': {
      bodySine(ctx, dest, t, 340 * tune, 165 * tune, 0.4 * v, 0.16);
      crack(ctx, dest, t, 3200, 0.7, 0.5 * v, 0.22);
      return { stopAt: t + 0.3 };
    }
    case 'clap': {
      // Three micro-bursts then the tail — the classic 909 clap trick.
      for (let i = 0; i < 3; i++) crack(ctx, dest, t + i * 0.011, 1800, 1.2, 0.34 * v, 0.03);
      crack(ctx, dest, t + 0.033, 1500, 0.9, 0.4 * v, 0.24);
      return { stopAt: t + 0.32 };
    }
    case 'hat-closed': {
      crack(ctx, dest, t, 8200 * tune, 1.1, 0.34 * v, 0.055, 'highpass');
      return { stopAt: t + 0.1 };
    }
    case 'hat-open': {
      crack(ctx, dest, t, 7800 * tune, 0.9, 0.32 * v, 0.42, 'highpass');
      return { stopAt: t + 0.5 };
    }
    default: {
      crack(ctx, dest, t, 2000, 0.8, 0.3 * v, 0.15);
      return { stopAt: t + 0.2 };
    }
  }
}
