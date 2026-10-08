// mediaEngine/programAudio.ts — program audio with audio-follow-video (AFV).
//
// Every source with an audio track gets a gain on the shared platform audio context. The
// source on program is up, everything else is down, and during a transition the outgoing
// and incoming sources crossfade with the T-bar. Sources marked "always on" (a commentator
// mic, a scoreboard horn) stay up regardless of what is on program.
//
// The mix goes to a MediaStreamDestination — that's what recording and going live carry.
// It is NOT sent to the speakers by default: monitoring a room mic through the room's
// speakers feeds back. Call setMonitor(true) to hear it (headphones).

import { platformAudio } from './audioRuntime';

interface Channel { stream: MediaStream; node: MediaStreamAudioSourceNode; gain: GainNode }

export interface AudioMixState {
  programId?: string | null;
  previewId?: string | null;
  /** Transition position 0..1 — the incoming source's share of the crossfade. */
  position: number;
  /** Source ids that are always in the mix (commentary, ambient). */
  alwaysOn?: string[];
}

const RAMP_S = 0.04; // short ramps avoid zipper noise on cuts

export class ProgramAudioMixer {
  private ctx: AudioContext;
  private bus: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private channels = new Map<string, Channel>();
  private monitor: GainNode | null = null;
  private last: AudioMixState = { position: 0 };

  constructor() {
    this.ctx = platformAudio.getContext();
    this.bus = this.ctx.createGain();
    this.dest = this.ctx.createMediaStreamDestination();
    this.bus.connect(this.dest);
  }

  get stream(): MediaStream { return this.dest.stream; }

  /** The sources that can contribute audio. Unlisted ones are removed. */
  setSources(sources: { id: string; stream: MediaStream | null | undefined }[]) {
    const keep = new Set<string>();
    for (const { id, stream } of sources) {
      if (!stream || stream.getAudioTracks().length === 0) continue;
      keep.add(id);
      const existing = this.channels.get(id);
      if (existing && existing.stream === stream) continue;
      if (existing) this.drop(id);
      try {
        const node = this.ctx.createMediaStreamSource(stream);
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.bus);
        this.channels.set(id, { stream, node, gain });
      } catch { /* a stream whose audio can't be tapped just stays silent */ }
    }
    for (const id of [...this.channels.keys()]) if (!keep.has(id)) this.drop(id);
    this.apply(this.last);
  }

  /** Recompute AFV gains. */
  apply(state: AudioMixState) {
    this.last = state;
    const t = this.ctx.currentTime;
    const p = Math.max(0, Math.min(1, state.position));
    const always = new Set(state.alwaysOn ?? []);
    for (const [id, ch] of this.channels) {
      let g = 0;
      if (always.has(id)) g = 1;
      else if (id === state.programId && id === state.previewId) g = 1;
      else if (id === state.programId) g = 1 - p;
      else if (id === state.previewId) g = p;
      // Equal-power-ish curve keeps the level steady through the middle of a crossfade.
      const target = g === 0 || g === 1 ? g : Math.sin(g * Math.PI / 2);
      ch.gain.gain.cancelScheduledValues(t);
      ch.gain.gain.setTargetAtTime(target, t, RAMP_S / 3);
    }
  }

  /** Route the program mix to the speakers (off by default — see the header note). */
  setMonitor(on: boolean) {
    if (on && !this.monitor) {
      this.monitor = this.ctx.createGain();
      this.bus.connect(this.monitor).connect(platformAudio.mainBus('program-monitor'));
    } else if (!on && this.monitor) {
      try { this.bus.disconnect(this.monitor); } catch { /* */ }
      this.monitor.disconnect();
      this.monitor = null;
    }
  }

  /** Resume the audio context (browsers start it suspended until a user gesture). */
  resume() { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  dispose() {
    for (const id of [...this.channels.keys()]) this.drop(id);
    this.setMonitor(false);
    try { this.bus.disconnect(); } catch { /* */ }
  }

  private drop(id: string) {
    const ch = this.channels.get(id);
    if (!ch) return;
    try { ch.node.disconnect(); ch.gain.disconnect(); } catch { /* */ }
    this.channels.delete(id);
  }
}
