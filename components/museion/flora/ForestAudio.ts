// ForestAudio — the layered ambience of the Living Forest.
//
// A base bed plus independently looping layers (birdsong, wind, water) whose
// gains drift on slow LFOs, so the soundscape never audibly repeats even though
// it is a handful of short files. Rooms re-colour the air through one shared
// low-pass + the museum's existing reverb send.
//
// Everything routes through the SHARED AudioContext in services/fabula/audioGraph
// — a second context would fight the first for the device and is the documented
// cause of the editor's old dropouts. Start is gesture-gated: browsers refuse to
// run a context until the visitor has interacted, and a silent forest reads as
// a bug rather than a policy.

import { getAudioCtx, resumeAudioCtx, getMasterInput, getFxSends } from '../../../services/fabula/audioGraph';

export type ForestRoom = 'forest' | 'ocean' | 'ancient' | 'fungal';

interface LayerSpec {
  id: string;
  url: string;
  gain: number;      // resting level
  drift: number;     // how far the LFO moves it
  period: number;    // seconds per drift cycle — deliberately coprime-ish
}

/** CC0 beds live under public/audio/forest/. Missing files degrade to silence. */
const LAYERS: LayerSpec[] = [
  { id: 'bed',    url: '/audio/forest/bed.mp3',    gain: 0.34, drift: 0.05, period: 47 },
  { id: 'birds',  url: '/audio/forest/birds.mp3',  gain: 0.22, drift: 0.16, period: 31 },
  { id: 'wind',   url: '/audio/forest/wind.mp3',   gain: 0.18, drift: 0.12, period: 23 },
  { id: 'creek',  url: '/audio/forest/creek.mp3',  gain: 0.14, drift: 0.07, period: 37 },
];

/** Per-room colouring: filter cutoff, reverb send, and which layers belong. */
const ROOMS: Record<ForestRoom, { cutoff: number; reverb: number; layers: string[] }> = {
  forest:  { cutoff: 18000, reverb: 0.10, layers: ['bed', 'birds', 'wind', 'creek'] },
  ocean:   { cutoff: 900,   reverb: 0.28, layers: ['bed', 'creek'] },        // muffled, watery
  ancient: { cutoff: 7000,  reverb: 0.55, layers: ['bed', 'wind'] },         // sparse, cavernous
  fungal:  { cutoff: 4200,  reverb: 0.16, layers: ['bed'] },                 // close and quiet
};

interface Layer { src: AudioBufferSourceNode; gain: GainNode; spec: LayerSpec; }

export class ForestAudio {
  private layers: Layer[] = [];
  private filter: BiquadFilterNode | null = null;
  private bus: GainNode | null = null;
  private send: GainNode | null = null;
  private raf = 0;
  private started = false;
  private room: ForestRoom = 'forest';
  private masterLevel = 1;

  get running(): boolean { return this.started; }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async start(): Promise<boolean> {
    if (this.started) return true;
    const ctx = getAudioCtx();
    const master = getMasterInput();
    if (!ctx || !master) return false;
    resumeAudioCtx();
    if (ctx.state !== 'running') return false;

    this.bus = ctx.createGain();
    this.bus.gain.value = this.masterLevel;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = ROOMS[this.room].cutoff;
    this.filter.Q.value = 0.6;
    this.bus.connect(this.filter);
    this.filter.connect(master);

    const fx = getFxSends();
    if (fx) {
      this.send = ctx.createGain();
      this.send.gain.value = ROOMS[this.room].reverb;
      this.filter.connect(this.send);
      this.send.connect(fx.reverbSend);
    }

    // Load in parallel; a layer whose file is absent is simply skipped.
    const loaded = await Promise.all(LAYERS.map(async (spec) => {
      try {
        const res = await fetch(spec.url);
        if (!res.ok) return null;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        return { spec, buf };
      } catch { return null; }
    }));

    for (const item of loaded) {
      if (!item || !this.bus) continue;
      const g = ctx.createGain();
      g.gain.value = 0;
      const src = ctx.createBufferSource();
      src.buffer = item.buf;
      src.loop = true;
      // Offset each layer so they never phase-lock into an audible loop.
      const offset = Math.random() * item.buf.duration;
      src.connect(g); g.connect(this.bus);
      try { src.start(0, offset); } catch { continue; }
      this.layers.push({ src, gain: g, spec: item.spec });
    }

    if (!this.layers.length) { this.stop(); return false; }
    this.started = true;
    this.applyRoom(this.room, 0.6);
    this.tick();
    return true;
  }

  /** Cross-fade into a room's air. */
  applyRoom(room: ForestRoom, fade = 1.6) {
    this.room = room;
    const ctx = getAudioCtx();
    if (!ctx || !this.started) return;
    const now = ctx.currentTime;
    const cfg = ROOMS[room];
    if (this.filter) {
      this.filter.frequency.cancelScheduledValues(now);
      this.filter.frequency.setTargetAtTime(cfg.cutoff, now, fade / 3);
    }
    if (this.send) this.send.gain.setTargetAtTime(cfg.reverb, now, fade / 3);
    for (const l of this.layers) {
      const on = cfg.layers.includes(l.spec.id);
      l.gain.gain.setTargetAtTime(on ? l.spec.gain : 0, now, fade / 3);
    }
  }

  /** Overall ambience level (the visitor's own volume control). */
  setLevel(v: number) {
    this.masterLevel = Math.max(0, Math.min(1, v));
    const ctx = getAudioCtx();
    if (this.bus && ctx) this.bus.gain.setTargetAtTime(this.masterLevel, ctx.currentTime, 0.15);
  }

  /** Slow, coprime gain drift — the trick that keeps short loops from sounding looped. */
  private tick = () => {
    const ctx = getAudioCtx();
    if (!this.started || !ctx) return;
    const t = ctx.currentTime;
    const cfg = ROOMS[this.room];
    for (const l of this.layers) {
      if (!cfg.layers.includes(l.spec.id)) continue;
      const lfo = Math.sin((t / l.spec.period) * Math.PI * 2);
      const target = Math.max(0, l.spec.gain + lfo * l.spec.drift);
      l.gain.gain.setTargetAtTime(target, t, 1.2);
    }
    this.raf = (typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(() => setTimeout(this.tick, 900))
      : 0) as unknown as number;
  };

  stop() {
    this.started = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const l of this.layers) {
      try { l.src.stop(); } catch { /* already stopped */ }
      try { l.src.disconnect(); l.gain.disconnect(); } catch { /* */ }
    }
    this.layers = [];
    try { this.filter?.disconnect(); this.bus?.disconnect(); this.send?.disconnect(); } catch { /* */ }
    this.filter = null; this.bus = null; this.send = null;
  }
}

/** Which room a gallery sounds like. */
export function roomForGallery(gallery: string): ForestRoom {
  if (gallery === 'ocean') return 'ocean';
  if (gallery === 'ancient') return 'ancient';
  if (gallery === 'fungal') return 'fungal';
  return 'forest';
}
