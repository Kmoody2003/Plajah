// Recorded sound bank (CC0 recordings, scripts/ravencrest/buildSfx.py → audio/sfx/sfx.json).
// One-shots are decoded up front so they fire on the frame they're asked for; each play picks a
// random take and nudges its pitch so repeats don't machine-gun. Nothing plays until loaded —
// callers keep their synthesized layers as the fallback.

const BASE = '/games/ravencrest/audio/sfx/';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface PlayOpts {
  pan?: number;
  gain?: number;
  /** Playback rate range (pitch). */
  rate?: [number, number];
  /** Reverb send. */
  wet?: number;
  delay?: number;
  /** Lowpass cutoff (distance, walls). */
  lowpass?: number;
  /** Take index instead of a random one. */
  take?: number;
}

export class SampleBank {
  private takes = new Map<string, AudioBuffer[]>();
  private last = new Map<string, number>();
  ready = false;

  constructor(private ctx: AudioContext, private dry: () => AudioNode, private verb: () => AudioNode | null) {}

  async load() {
    try {
      const r = await fetch(BASE + 'sfx.json');
      if (!r.ok) return;
      const m = await r.json() as Record<string, { kind: string; files: string[] }>;
      await Promise.all(Object.entries(m).map(async ([name, e]) => {
        const bufs = await Promise.all(e.files.map((f) => fetch(BASE + f).then((x) => x.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => null)));
        const ok = bufs.filter((b): b is AudioBuffer => !!b);
        if (ok.length) this.takes.set(name, ok);
      }));
      this.ready = true;
    } catch { /* synth only */ }
  }

  has(name: string) { return this.takes.has(name); }
  buffer(name: string) { return this.takes.get(name)?.[0] ?? null; }

  /** Fire a take; false when the bank (or that sound) isn't loaded. */
  play(name: string, o: PlayOpts = {}, out?: AudioNode): boolean {
    const list = this.takes.get(name);
    if (!list) return false;
    const ctx = this.ctx;
    let i = o.take ?? Math.floor(Math.random() * list.length);
    if (o.take === undefined && list.length > 1 && i === this.last.get(name)) i = (i + 1) % list.length;
    this.last.set(name, i);
    const s = ctx.createBufferSource(); s.buffer = list[i % list.length];
    const [r0, r1] = o.rate ?? [0.95, 1.05];
    s.playbackRate.value = rnd(r0, r1);
    let n: AudioNode = s;
    if (o.lowpass) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lowpass; n = n.connect(lp); }
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    n.connect(g).connect(p).connect(out ?? this.dry());
    const v = this.verb();
    if (v && (o.wet ?? 0.2) > 0) { const w = ctx.createGain(); w.gain.value = o.wet ?? 0.2; p.connect(w).connect(v); }
    s.start(ctx.currentTime + (o.delay ?? 0) + 0.005);
    return true;
  }

  /** A looping bed (stereo); returns its gain so the caller can ride it. */
  loop(name: string, out: AudioNode): GainNode | null {
    const b = this.buffer(name);
    if (!b) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    s.connect(g).connect(out);
    s.start(0, Math.random() * b.duration);
    return g;
  }
}
