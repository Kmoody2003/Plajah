// Ambience beds: synthesised noise + tones that run until stopped. Built from looping noise buffers, filters and slow LFOs (no timers, so they
// keep running smoothly even when the tab is throttled). Each bed returns a handle; the engine fades it in/out through its own gain.

import { BED_LEVEL } from './calibration';
import { type Ctx, getNoise } from './dsp';

export interface BedHandle { stop(atTime: number): void }
export interface BedDef { id: string; label: string; /** nominal level so every bed sits near the same loudness */ level: number; build(c: Ctx, out: AudioNode, t: number): BedHandle }

type Src = AudioScheduledSourceNode;

class Kit {
  srcs: Src[] = [];
  constructor(public c: Ctx, public out: AudioNode, public t: number) {}
  noise(color: 'white' | 'pink' | 'brown', offset = 0): AudioBufferSourceNode {
    const n = this.c.createBufferSource(); n.buffer = getNoise(this.c, color, 6); n.loop = true; n.start(this.t, offset % 5); this.srcs.push(n); return n;
  }
  osc(type: OscillatorType, hz: number, detune = 0): OscillatorNode {
    const o = this.c.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune; o.start(this.t); this.srcs.push(o); return o;
  }
  filt(type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode { const f = this.c.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; }
  gain(v: number): GainNode { const g = this.c.createGain(); g.gain.value = v; return g; }
  chain(...nodes: AudioNode[]) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  /** low-frequency modulation: base + osc * depth into a param */
  lfo(hz: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') {
    const l = this.osc(type, hz); const g = this.gain(depth); l.connect(g); g.connect(target);
  }
  handle(): BedHandle {
    return { stop: (at) => { for (const s of this.srcs) { try { s.stop(at + 0.05); } catch { /* ended */ } } } };
  }
}

/** One cricket: carrier gated by a fast chirp LFO that is itself gated by a slow phrase LFO. */
function cricket(k: Kit, carrierHz: number, chirpHz: number, phraseHz: number, level: number) {
  const c = k.osc('sine', carrierHz);
  const a = k.gain(0);                                  // chirp gate: 0..1 square-ish pulses
  const chirp = k.osc('sine', chirpHz); const shape = k.c.createWaveShaper();
  const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; curve[i] = Math.max(0, Math.min(1, x * 3)); }
  shape.curve = curve; chirp.connect(shape); shape.connect(a.gain);
  const b = k.gain(0);                                   // phrase gate
  const phrase = k.osc('sine', phraseHz); const shape2 = k.c.createWaveShaper();
  const curve2 = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; curve2[i] = Math.max(0, Math.min(1, (x - 0.1) * 6)); }
  shape2.curve = curve2; phrase.connect(shape2); shape2.connect(b.gain);
  const lvl = k.gain(level);
  k.chain(c, a, b, lvl, k.out);
}

const BEDS: BedDef[] = [
  {
    id: 'night-crickets', label: 'Night crickets', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      cricket(k, 4300, 15.5, 0.31, 0.05); cricket(k, 4650, 17, 0.23, 0.04); cricket(k, 5100, 14.2, 0.19, 0.03); cricket(k, 3900, 16.4, 0.37, 0.035);
      k.chain(k.noise('brown'), k.filt('lowpass', 260), k.gain(0.1), out);                // night air
      return k.handle();
    },
  },
  {
    id: 'forest-wind', label: 'Forest wind', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      const bp = k.filt('bandpass', 520, 0.8); const g = k.gain(0.4);
      k.lfo(0.07, 220, bp.frequency); k.lfo(0.13, 0.18, g.gain);
      k.chain(k.noise('pink'), bp, k.filt('lowpass', 1500), g, out);
      const leaves = k.filt('highpass', 3200); const lg = k.gain(0.05);
      k.lfo(0.21, 0.04, lg.gain);
      k.chain(k.noise('pink', 2), leaves, lg, out);                                          // leaf hiss swelling in the gusts
      k.chain(k.noise('brown', 3), k.filt('lowpass', 200), k.gain(0.1), out);
      return k.handle();
    },
  },
  {
    id: 'ocean-hum', label: 'Ocean hum', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      const g = k.gain(0.28); k.lfo(0.09, 0.2, g.gain);
      k.chain(k.noise('brown'), k.filt('lowpass', 620), g, out);
      const g2 = k.gain(0.06); k.lfo(0.11, 0.045, g2.gain);
      k.chain(k.noise('pink', 1), k.filt('bandpass', 1800, 0.6), g2, out);                   // foam
      k.chain(k.osc('sine', 55), k.gain(0.05), out); k.chain(k.osc('sine', 82.6, 4), k.gain(0.025), out);
      return k.handle();
    },
  },
  {
    id: 'city-murmur', label: 'City murmur', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      k.chain(k.noise('brown'), k.filt('bandpass', 380, 0.5), k.gain(0.42), out);
      const g = k.gain(0.1); k.lfo(0.7, 0.05, g.gain);
      k.chain(k.noise('pink', 2), k.filt('bandpass', 1100, 0.9), g, out);                    // voices
      k.chain(k.osc('sine', 60), k.gain(0.035), out); k.chain(k.osc('sine', 120.7), k.gain(0.014), out);
      return k.handle();
    },
  },
  {
    id: 'room-tone', label: 'Room tone', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      k.chain(k.noise('brown'), k.filt('lowpass', 180), k.gain(0.2), out);
      k.chain(k.osc('sine', 50), k.gain(0.022), out);
      k.chain(k.noise('pink', 1), k.filt('highpass', 4200), k.gain(0.008), out);
      return k.handle();
    },
  },
  {
    id: 'space-drone', label: 'Space drone', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      const lp = k.filt('lowpass', 900, 0.6); const sum = k.gain(1);
      [[55, 0], [82.4, 6], [110.2, -5], [164.9, 9]].forEach(([hz, d], i) => { const o = k.osc(i % 2 ? 'triangle' : 'sine', hz, d); const g = k.gain(0.06 / (1 + i * 0.6)); k.lfo(0.05 + i * 0.03, 0.03 / (1 + i), g.gain); k.chain(o, g, sum); });
      k.lfo(0.04, 300, lp.frequency);
      k.chain(sum, lp, out);
      const sh = k.osc('sine', 1318.5); const sg = k.gain(0.0); k.lfo(0.13, 0.006, sg.gain); k.chain(sh, sg, out);                  // faint shimmer
      k.chain(k.noise('pink', 3), k.filt('bandpass', 700, 3), k.gain(0.02), out);
      return k.handle();
    },
  },
  {
    id: 'wind', label: 'Wind', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      const bp = k.filt('bandpass', 650, 1.4); const g = k.gain(0.4);
      k.lfo(0.19, 320, bp.frequency); k.lfo(0.23, 0.25, g.gain);
      k.chain(k.noise('pink'), bp, g, out);
      k.chain(k.noise('brown', 2), k.filt('lowpass', 220), k.gain(0.1), out);
      return k.handle();
    },
  },
  {
    id: 'rain-soft', label: 'Soft rain', level: 1,
    build(c, out, t) {
      const k = new Kit(c, out, t);
      const g = k.gain(0.12); k.lfo(0.5, 0.02, g.gain);
      k.chain(k.noise('white'), k.filt('highpass', 1800), k.filt('lowpass', 8500), g, out);
      // patter: bandpassed noise whose level is modulated by slow noise
      const patter = k.noise('pink', 1); const pbp = k.filt('bandpass', 3800, 1.2); const pg = k.gain(0.0);
      const mod = k.noise('brown', 2); const mlp = k.filt('lowpass', 14); const mg = k.gain(0.35); mod.connect(mlp); mlp.connect(mg); mg.connect(pg.gain);
      k.chain(patter, pbp, pg, out);
      k.chain(k.noise('brown', 4), k.filt('lowpass', 300), k.gain(0.1), out);
      return k.handle();
    },
  },
  {
    id: 'forest-night', label: 'Forest night', level: 1,
    build(c, out, t) {
      const a = BEDS.find((b) => b.id === 'forest-wind')!.build(c, out, t);
      const g = c.createGain(); g.gain.value = 0.55; g.connect(out);
      const b = BEDS.find((b) => b.id === 'night-crickets')!.build(c, g, t);
      return { stop: (at) => { a.stop(at); b.stop(at); } };
    },
  },
];

for (const b of BEDS) if (BED_LEVEL[b.id] != null) b.level = BED_LEVEL[b.id];
export const AMBIENCE_BEDS: readonly BedDef[] = BEDS;
export const AMBIENCE_IDS: readonly string[] = BEDS.map((b) => b.id);
export const BED_BY_ID: ReadonlyMap<string, BedDef> = new Map(BEDS.map((b) => [b.id, b]));
export const BED_ALIASES: Record<string, string> = { crickets: 'night-crickets', forest: 'forest-wind', ocean: 'ocean-hum', city: 'city-murmur', room: 'room-tone', space: 'space-drone', rain: 'rain-soft' };
export const resolveBed = (id: string): BedDef | undefined => BED_BY_ID.get(id) ?? BED_BY_ID.get(BED_ALIASES[id]);
