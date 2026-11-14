// MEKA Sampler — slices → instrument (Maschine's "slices to keygroup"). Each slice becomes its own
// sample on its own key, rooted on that key so it plays back at its recorded pitch, ascending
// from `baseNote` (C1 = 36, where Maschine's keyboard mode and most drum maps start). The result
// is a KERA program: play the chopped loop from the keys, a pad's Keys mode, or the piano roll.

import { emptyProgram, type KeraProgram, type KeraSample, type KeraZone } from '../../instruments/kera/zones';

export interface SliceSource { channels: Float32Array[]; sampleRate: number }

export function slicesToProgram(src: SliceSource, regions: { start: number; end: number }[], name: string, baseNote = 36): KeraProgram {
  const prog = emptyProgram(name);
  prog.source = 'file';
  // One-shot behaviour: full sustain while held, short release — a slice plays to its end.
  prog.amp = { attack: 0.001, hold: 0, decay: 0.1, sustain: 1, release: 0.03 };
  const n = Math.min(regions.length, 128 - baseNote);
  for (let k = 0; k < n; k++) {
    const r = regions[k];
    const key = baseNote + k;
    const channels = src.channels.map((c) => {
      const out = c.slice(r.start, r.end);
      // 2 ms fade-out so a cut mid-waveform doesn't click.
      const f = Math.min(out.length, Math.round(src.sampleRate * 0.002));
      for (let i = 0; i < f; i++) out[out.length - 1 - i] *= i / f;
      return out;
    });
    const sample: KeraSample = {
      id: `${prog.id}_s${k}`, name: `${name} ${k + 1}`, channels, sampleRate: src.sampleRate,
      rootNote: key, fineTune: 0, loopStart: 0, loopEnd: 0, loopMode: 'off',
    };
    const zone: KeraZone = {
      sampleId: sample.id, loKey: key, hiKey: key, loVel: 1, hiVel: 127,
      rrGroup: 0, rrIndex: 0, tuneSemis: 0, tuneCents: 0, gainDb: 0, pan: 0, offGroup: 0,
    };
    prog.samples.push(sample);
    prog.zones.push(zone);
  }
  return prog;
}
