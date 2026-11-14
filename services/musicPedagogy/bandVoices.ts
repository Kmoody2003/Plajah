// Classroom voices for the faculty band — small Web Audio instruments, one recipe per role, so a
// lesson sounds like a band without loading Chora's engines. Not the studio sound: in Chora the
// players sit on AURA/BAJO/SOMA/ONDA/KERA; here it's a teaching sketch on the ear-training context.

import { audio, midiToFreq, note as pianoNote } from './earAudio';
import { playerById, type BandRole } from '../melos/beats/band/roster';
import type { BandOutput } from '../melos/beats/band/session';
import type { BandHit, BandNote } from '../melos/beats/band/performer';
import type { DrumVoice } from '../melos/beats/band/styles';

let bus: GainNode | null = null;
let noise: AudioBuffer | null = null;
const live = new Set<AudioScheduledSourceNode>();

function out(): { ac: AudioContext; bus: GainNode } {
  const ac = audio();
  if (!bus) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    bus = ac.createGain(); bus.gain.value = 0.7;
    bus.connect(comp); comp.connect(ac.destination);
  }
  return { ac, bus };
}

function noiseBuf(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function keep(n: AudioScheduledSourceNode) { live.add(n); n.onended = () => live.delete(n); }

/** Silence the band (stop / switching lessons). */
export function hushBand(): void {
  for (const n of live) { try { n.stop(); } catch { /* already stopped */ } }
  live.clear();
}

interface Recipe { waves: [OscillatorType, number, number][]; cutoff: number; q?: number; attack: number; release: number; decay?: number; vib?: number; breath?: number; level: number }

/** Per role: oscillators [type, ratio, gain], filter, envelope, vibrato depth (semis), breath noise. */
const RECIPES: Partial<Record<BandRole, Recipe>> = {
  bass: { waves: [['triangle', 1, 1], ['sine', 1, 0.6]], cutoff: 900, attack: 0.008, release: 0.08, decay: 0.9, level: 0.55 },
  guitar: { waves: [['sawtooth', 1, 0.6], ['square', 2, 0.12]], cutoff: 2600, q: 1.2, attack: 0.003, release: 0.12, decay: 0.55, level: 0.22 },
  organ: { waves: [['sine', 1, 1], ['sine', 2, 0.7], ['sine', 3, 0.45], ['sine', 4, 0.25], ['sine', 0.5, 0.5]], cutoff: 5000, attack: 0.012, release: 0.05, vib: 0.08, level: 0.13 },
  synth: { waves: [['sawtooth', 1, 0.6], ['sawtooth', 1.006, 0.6], ['square', 0.5, 0.25]], cutoff: 2200, q: 4, attack: 0.005, release: 0.15, decay: 0.4, level: 0.14 },
  cello: { waves: [['sawtooth', 1, 1], ['sawtooth', 1.003, 0.5]], cutoff: 1500, attack: 0.08, release: 0.2, vib: 0.18, level: 0.2 },
  violin: { waves: [['sawtooth', 1, 1], ['sawtooth', 0.997, 0.4]], cutoff: 3400, attack: 0.06, release: 0.18, vib: 0.22, level: 0.15 },
  trumpet: { waves: [['sawtooth', 1, 1], ['square', 1, 0.2]], cutoff: 2800, q: 2, attack: 0.03, release: 0.08, vib: 0.12, breath: 0.04, level: 0.16 },
  sax: { waves: [['square', 1, 0.6], ['sawtooth', 1, 0.5]], cutoff: 1900, q: 3, attack: 0.03, release: 0.1, vib: 0.16, breath: 0.08, level: 0.15 },
  woodwinds: { waves: [['sine', 1, 1], ['triangle', 2, 0.2]], cutoff: 4000, attack: 0.04, release: 0.1, vib: 0.12, breath: 0.12, level: 0.2 },
  orchestra: { waves: [['sawtooth', 1, 0.5], ['sawtooth', 1.004, 0.5], ['sawtooth', 0.996, 0.5]], cutoff: 1800, attack: 0.25, release: 0.4, vib: 0.1, level: 0.12 },
};

function tone(r: Recipe, n: BandNote, when: number, dur: number) {
  const { ac, bus } = out();
  const t0 = Math.max(when, ac.currentTime + 0.005);
  const f = midiToFreq(n.key);
  const amp = (n.vel / 127) ** 1.4 * r.level;
  const short = n.articulation === 'staccato' || n.articulation === 'spiccato' || n.articulation === 'pizzicato';
  const d = short ? Math.min(dur, 0.12) : dur;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + r.attack);
  if (r.decay) env.gain.setTargetAtTime(amp * 0.25, t0 + r.attack, r.decay / 2);
  env.gain.setTargetAtTime(0, t0 + d, r.release / 3);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = r.q ?? 0.7;
  lp.frequency.setValueAtTime(Math.min(16000, r.cutoff * (0.6 + n.vel / 127)), t0);
  if (r.decay) lp.frequency.setTargetAtTime(r.cutoff * 0.4, t0, r.decay);
  lp.connect(env); env.connect(bus);
  const end = t0 + d + r.release + 0.05;
  const glide = n.expr?.glideFromSemis ?? 0;
  const vibDepth = (n.expr?.vibratoDepth ?? 0.5) * (r.vib ?? 0);
  let lfo: OscillatorNode | null = null, lfoGain: GainNode | null = null;
  if (vibDepth > 0 && d > 0.25) {
    lfo = ac.createOscillator(); lfo.frequency.value = 5.4;
    lfoGain = ac.createGain();
    lfoGain.gain.setValueAtTime(0, t0); lfoGain.gain.linearRampToValueAtTime(f * (2 ** (vibDepth / 12) - 1), t0 + Math.min(0.5, d * 0.6));
    lfo.connect(lfoGain); lfo.start(t0); lfo.stop(end); keep(lfo);
  }
  for (const [type, ratio, g] of r.waves) {
    const o = ac.createOscillator();
    o.type = type;
    const target = f * ratio;
    if (glide) { o.frequency.setValueAtTime(target * 2 ** (glide / 12), t0); o.frequency.exponentialRampToValueAtTime(target, t0 + 0.09); }
    else o.frequency.setValueAtTime(target, t0);
    if (lfoGain) lfoGain.connect(o.frequency);
    const og = ac.createGain(); og.gain.value = g;
    o.connect(og); og.connect(lp);
    o.start(t0); o.stop(end); keep(o);
  }
  if (r.breath) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5;
    const bg = ac.createGain(); bg.gain.value = r.breath;
    s.connect(bp); bp.connect(bg); bg.connect(env);
    s.start(t0); s.stop(end); keep(s);
  }
}

/** A hand drum (congas, djembe, timpani): a pitched membrane with a quick pitch drop. */
function membrane(n: BandNote, when: number) {
  const { ac, bus } = out();
  const t0 = Math.max(when, ac.currentTime + 0.005);
  const f = midiToFreq(n.key - 12);
  const g = ac.createGain();
  const amp = (n.vel / 127) * 0.5;
  const ring = n.len > 0.5 ? 0.9 : 0.25;
  g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ring);
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.5, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.03);
  o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + ring + 0.05); keep(o);
  if (n.key >= 64) drumNoise(t0, 0.04, 2500, amp * 0.6, 'bandpass');   // slap
}

function drumNoise(t0: number, len: number, freq: number, amp: number, type: BiquadFilterType) {
  const { ac, bus } = out();
  const s = ac.createBufferSource(); s.buffer = noiseBuf(ac);
  const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = type === 'bandpass' ? 1 : 0.7;
  const g = ac.createGain(); g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + len + 0.02); keep(s);
}

function drumTone(t0: number, from: number, to: number, len: number, amp: number) {
  const { ac, bus } = out();
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(from, t0); o.frequency.exponentialRampToValueAtTime(to, t0 + len * 0.4);
  const g = ac.createGain(); g.gain.setValueAtTime(amp, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + len + 0.02); keep(o);
}

const KIT: Record<DrumVoice, (t: number, a: number) => void> = {
  kick: (t, a) => drumTone(t, 140, 48, 0.35, a * 0.9),
  snare: (t, a) => { drumTone(t, 230, 180, 0.1, a * 0.35); drumNoise(t, 0.18, 1800, a * 0.5, 'highpass'); },
  ghost: (t, a) => drumNoise(t, 0.06, 2000, a * 0.3, 'highpass'),
  clap: (t, a) => { for (let i = 0; i < 3; i++) drumNoise(t + i * 0.011, 0.09, 1400, a * 0.4, 'bandpass'); },
  rim: (t, a) => drumTone(t, 1700, 1600, 0.03, a * 0.3),
  hatC: (t, a) => drumNoise(t, 0.04, 8000, a * 0.22, 'highpass'),
  hatO: (t, a) => drumNoise(t, 0.28, 7500, a * 0.2, 'highpass'),
  ride: (t, a) => { drumNoise(t, 0.5, 6000, a * 0.12, 'bandpass'); drumTone(t, 3200, 3100, 0.3, a * 0.04); },
  crash: (t, a) => drumNoise(t, 1.4, 5000, a * 0.28, 'highpass'),
  tomH: (t, a) => drumTone(t, 220, 160, 0.3, a * 0.6),
  tomL: (t, a) => drumTone(t, 130, 90, 0.4, a * 0.65),
  shaker: (t, a) => drumNoise(t, 0.05, 9000, a * 0.12, 'highpass'),
};

/** The BandOutput the faculty room plays through. `muted` players are skipped. */
export function bandVoices(muted: () => Set<string> = () => new Set()): BandOutput {
  return {
    note(pid, n, when, lenSec) {
      if (muted().has(pid)) return;
      const role = playerById(pid)?.role;
      if (!role) return;
      if (role === 'piano') { pianoNote(n.key, when, Math.max(0.1, lenSec), Math.min(0.9, n.vel / 140)); return; }
      if (role === 'percussion') { membrane(n, when); return; }
      const r = RECIPES[role];
      if (r) tone(r, n, when, Math.max(0.05, lenSec));
    },
    hit(pid, h: BandHit, when) {
      if (muted().has(pid)) return;
      const { ac } = out();
      KIT[h.voice]?.(Math.max(when, ac.currentTime + 0.005), (h.vel / 127) ** 1.2);
    },
  };
}
