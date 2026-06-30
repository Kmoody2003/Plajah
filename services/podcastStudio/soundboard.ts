// soundboard.ts — the cue pads (stingers / jingles / drops / beds / SFX). Each pad fires into the
// mix engine's "soundboard" channel; one-shots auto-duck the host/callers for the cue's duration,
// beds loop until stopped. Cues are decoded + cached; a couple of synthesized built-ins ship so the
// board isn't empty before the user uploads their own.

import type { MixEngine } from './mixEngine';

export interface SoundPad {
  id: string;
  label: string;
  url?: string;        // user cue (Storage URL); omit for a synthesized built-in
  builtin?: 'beep' | 'whoosh' | 'riser';
  loop?: boolean;      // beds loop
  color?: string;
}

const CH = 'soundboard';

export class Soundboard {
  private buffers = new Map<string, AudioBuffer>();
  private active = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();

  constructor(private mix: MixEngine) {
    mix.addChannel(CH, 'Soundboard', { duckable: false });
  }

  private async buffer(pad: SoundPad): Promise<AudioBuffer | null> {
    if (this.buffers.has(pad.id)) return this.buffers.get(pad.id)!;
    let buf: AudioBuffer | null = null;
    if (pad.builtin) buf = synthCue(this.mix.ctx, pad.builtin);
    else if (pad.url) {
      try {
        const res = await fetch(pad.url.startsWith('http') && !pad.url.includes(location.host) ? `/api/proxy?url=${encodeURIComponent(pad.url)}` : pad.url);
        buf = await this.mix.ctx.decodeAudioData(await res.arrayBuffer());
      } catch { buf = null; }
    }
    if (buf) this.buffers.set(pad.id, buf);
    return buf;
  }

  async fire(pad: SoundPad): Promise<void> {
    await this.mix.resume();
    const buf = await this.buffer(pad);
    if (!buf) return;
    this.stop(pad.id); // retrigger
    const src = this.mix.ctx.createBufferSource(); src.buffer = buf; src.loop = !!pad.loop;
    const gain = this.mix.ctx.createGain();
    src.connect(gain);
    this.mix.connectNode(CH, gain, 'Soundboard');
    if (!pad.loop) this.mix.duck(true);
    src.onended = () => { this.active.delete(pad.id); if (!pad.loop && this.active.size === 0) this.mix.duck(false); };
    src.start();
    this.active.set(pad.id, { src, gain });
  }

  stop(id: string): void {
    const a = this.active.get(id);
    if (a) { try { a.src.stop(); } catch { /* */ } try { a.gain.disconnect(); } catch { /* */ } this.active.delete(id); }
    if (this.active.size === 0) this.mix.duck(false);
  }
  stopAll(): void { [...this.active.keys()].forEach(id => this.stop(id)); }
  isPlaying(id: string): boolean { return this.active.has(id); }
}

// ── Synthesized built-in cues (no assets) ──────────────────────────────────────────
function synthCue(ctx: AudioContext, kind: 'beep' | 'whoosh' | 'riser'): AudioBuffer {
  const dur = kind === 'beep' ? 0.18 : 0.6;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate, p = i / len, env = Math.sin(Math.PI * p);
    if (kind === 'beep') d[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.5;
    else if (kind === 'whoosh') d[i] = (Math.random() * 2 - 1) * env * (1 - p) * 0.6;
    else d[i] = Math.sin(2 * Math.PI * (200 + 900 * p) * t) * env * 0.45; // riser
  }
  return buf;
}

export const DEFAULT_PADS: SoundPad[] = [
  { id: 'beep', label: 'Beep', builtin: 'beep', color: '#FF8C00' },
  { id: 'whoosh', label: 'Whoosh', builtin: 'whoosh', color: '#8166e6' },
  { id: 'riser', label: 'Riser', builtin: 'riser', color: '#5fd17f' },
];
