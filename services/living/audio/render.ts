// Offline rendering: run the same synthesis the live engine uses through an OfflineAudioContext. Used by the verification tests
// (we cannot listen, so we measure) and by the lab's "export WAV". Works with any BaseAudioContext-compatible offline context.

import type { Score } from '../contracts';
import { AMBIENCE_BEDS, resolveBed } from './ambience';
import { makePanner } from './dsp';
import { AudioGraph } from './graph';
import { playNoteInto } from './instruments';
import { expandScore, type TempoCurve } from './sequencer';
import { playSfxInto, type SfxPlayOpts } from './sfxCatalog';

export interface OfflineRender { samples: Float32Array; left: Float32Array; right: Float32Array; sampleRate: number }

export interface RenderOpts { seconds: number; sampleRate?: number; reducedSound?: boolean }

async function run(o: RenderOpts, build: (c: OfflineAudioContext, g: AudioGraph) => void): Promise<OfflineRender> {
  const sr = o.sampleRate ?? 44100;
  const c = new OfflineAudioContext(2, Math.ceil(o.seconds * sr), sr);
  const g = new AudioGraph(c);
  if (o.reducedSound) g.setReducedSound(true, true);
  build(c, g);
  const buf = await c.startRendering();
  const left = buf.getChannelData(0), right = buf.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (left[i] + right[i]);
  return { samples: mono, left: new Float32Array(left), right: new Float32Array(right), sampleRate: sr };
}

/** A catalogue sound through the full master chain. `raw` skips the chain (buses/limiter) to measure the sound itself. */
export function renderSfx(id: string, o: RenderOpts & SfxPlayOpts & { raw?: boolean }): Promise<OfflineRender> {
  return run(o, (c, g) => { playSfxInto(c, o.raw ? c.destination : g.sfx, 0.01, id, { ...o, seed: o.seed ?? 4242, variation: o.variation ?? 0 }); });
}

export function renderNote(instrument: string, note: string | number, o: RenderOpts & { durationMs?: number; gain?: number; vel?: number; raw?: boolean }): Promise<OfflineRender> {
  return run(o, (c, g) => { playNoteInto(c, o.raw ? c.destination : g.sfx, 0.01, instrument, note, { durationMs: o.durationMs ?? 600, gain: o.gain, vel: o.vel ?? 0.7, seed: 4242 }); });
}

export function renderAmbience(bed: string, o: RenderOpts & { gain?: number; depth?: number; duck?: { amount: number; ms: number } }): Promise<OfflineRender> {
  return run(o, (c, g) => {
    const def = resolveBed(bed); if (!def) throw new Error(`unknown bed ${bed}`);
    const gain = c.createGain(); gain.gain.value = (o.gain ?? 0.5) * def.level; gain.connect(g.ambience.input);
    def.build(c, gain, 0);
    if (o.depth != null) g.setDepth(o.depth);
    if (o.duck) g.duck(o.duck.amount, o.duck.ms);
  });
}

/** Schedule every event of a cue (up to `seconds`) into a graph's music bus. */
export function scheduleScore(c: BaseAudioContext, g: AudioGraph, score: Score, seconds: number, o: { tempoScale?: number; tempo?: TempoCurve; soft?: boolean } = {}) {
  const runGain = c.createGain(); runGain.connect(g.music.input);
  const send = c.createGain(); send.gain.value = (score.reverb ?? 0.15) * 0.6; runGain.connect(send); send.connect(g.reverbIn);
  const pans = new Map<number, AudioNode>();
  const events = expandScore(score, seconds, { tempoScale: o.tempoScale, tempo: o.tempo, startTime: 0.05 });
  for (const ev of events) {
    let pan = pans.get(ev.trackIndex);
    if (!pan) { pan = makePanner(c, ev.pan); pan.connect(runGain); pans.set(ev.trackIndex, pan); }
    const vg = c.createGain(); vg.connect(pan);
    playNoteInto(c, vg, ev.time, ev.instrument, ev.note, { durationMs: ev.durSec * 1000, gain: 0.8 * ev.gain, vel: ev.vel, soft: o.soft, seed: (ev.pass * 131 + ev.trackIndex * 17 + Math.floor(ev.beat * 8)) >>> 0 });
  }
  return events;
}

export function renderScore(score: Score, o: RenderOpts & { tempoScale?: number; tempo?: TempoCurve; depth?: number }): Promise<OfflineRender & { events: number }> {
  let count = 0;
  return run(o, (c, g) => {
    if (o.depth != null) g.setDepth(o.depth);
    count = scheduleScore(c, g, score, o.seconds, { tempoScale: o.tempoScale, tempo: o.tempo, soft: o.reducedSound }).length;
  }).then((r) => ({ ...r, events: count }));
}

export function renderCustom(o: RenderOpts, build: (c: OfflineAudioContext, g: AudioGraph) => void): Promise<OfflineRender> { return run(o, build); }

export const BED_IDS = AMBIENCE_BEDS.map((b) => b.id);
