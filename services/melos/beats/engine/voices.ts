// Melos Beats — voice allocation, AHDSR envelopes, chokes, holds. The live trigger path runs
// through here with NO React and no async: a MIDI hit must reach start(when) in the same task
// it arrived in. Trigger lineage: components/DJModeView.tsx:573-620, upgraded with polyphony
// caps, envelopes, click-free chokes, and sustain (held pads + legato-gated steps).

import type { GrooveDoc, PadConfig } from '../grooveDoc';
import type { BeatsGraph } from './graph';
import { playSynthVoice } from './synthVoices';

interface LiveVoice {
  padIdx: number;
  choke: number;
  gain: GainNode;
  src: AudioBufferSourceNode | null; // null for synth voices (they self-stop)
  releaseMs: number;
  held: boolean;                     // sustaining until release(padIdx) — live pad press
  endsAt: number;
}

const MAX_VOICES_PER_PAD = 8;
const CHOKE_RAMP = 0.004;  // 4ms ≈ 192 samples @48k — inaudible as a click, fast enough for hats
const MAX_HOLD_SEC = 30;   // safety cap for a held pad nobody releases

export function applyVelCurve(pad: PadConfig, vel127: number): number {
  const v = Math.max(0, Math.min(1, vel127 / 127));
  const curved = pad.velCurve === 'soft' ? Math.sqrt(v) : pad.velCurve === 'hard' ? v * v : v;
  return Math.pow(curved, 1.6); // perceptual gain taper
}

export class VoiceBank {
  private live: LiveVoice[] = [];
  private buffers = new Map<string, AudioBuffer>(); // SampleRef.key → decoded buffer

  constructor(private graph: BeatsGraph) {}

  setBuffer(key: string, buf: AudioBuffer) { this.buffers.set(key, buf); }
  getBuffer(key: string): AudioBuffer | undefined { return this.buffers.get(key); }
  hasBuffer(key: string) { return this.buffers.has(key); }
  bufferEntries(): [string, AudioBuffer][] { return [...this.buffers.entries()]; }
  clearBuffers() { this.buffers.clear(); }

  activeCount(): number {
    const now = this.graph.ctx.currentTime;
    this.live = this.live.filter((v) => v.endsAt > now);
    return this.live.length;
  }

  /**
   * Sample-accurate trigger. `when` defaults to now; the scheduler passes future times.
   * gateSec: note length for sequenced/drawn notes — the envelope releases at t+gate.
   *          Omitted on live pad hits: sustain>0 pads then HOLD until release(padIdx).
   * semiOffset: per-note pitch (piano-roll notes), added to the pad's own tuning.
   */
  trigger(doc: GrooveDoc, padIdx: number, vel127: number, when?: number, gateSec?: number, semiOffset = 0): void {
    const ctx = this.graph.ctx;
    const pad = doc.kit[padIdx];
    if (!pad || pad.mute) return;
    const t = Math.max(when ?? ctx.currentTime, ctx.currentTime);
    const gain = applyVelCurve(pad, vel127);
    if (gain <= 0) return;

    this.chokeGroup(pad.choke, t);
    this.reap(t);

    const dest = this.graph.padDestination(padIdx);
    const env = pad.env;
    const atk = Math.max(0.001, (env.attackMs || 0) / 1000);
    const hold = Math.max(0, (env.holdMs || 0) / 1000);
    const dec = Math.max(0.005, (env.decayMs || 0) / 1000);
    const sus = Math.max(0, Math.min(1, env.sustain || 0));
    const rel = Math.max(0.005, (env.releaseMs || 80) / 1000);
    const sustaining = sus > 0.001;
    const heldLive = sustaining && gateSec === undefined;
    // For a gated note the whole envelope is pre-scheduled (sample-accurate, works offline).
    const gate = sustaining && gateSec !== undefined ? Math.max(gateSec, atk + hold) : 0;

    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0.0001, t);
    vGain.gain.linearRampToValueAtTime(gain, t + atk);
    vGain.gain.setValueAtTime(gain, t + atk + hold);
    let audibleEnd: number;
    if (!sustaining) {
      vGain.gain.exponentialRampToValueAtTime(0.0001, t + atk + hold + dec);
      audibleEnd = t + atk + hold + dec;
    } else {
      const susLevel = Math.max(gain * sus, 0.0001);
      vGain.gain.exponentialRampToValueAtTime(susLevel, t + atk + hold + dec);
      if (heldLive) {
        audibleEnd = t + MAX_HOLD_SEC; // until release(padIdx) or the cap
      } else {
        // Param value persists at susLevel after the decay ramp; pin it at the gate end and
        // release from there — fully pre-scheduled, no timers.
        const tR = t + gate;
        vGain.gain.setValueAtTime(susLevel, Math.max(tR, t + atk + hold + dec));
        vGain.gain.exponentialRampToValueAtTime(0.0001, Math.max(tR, t + atk + hold + dec) + rel);
        audibleEnd = Math.max(tR, t + atk + hold + dec) + rel;
      }
    }
    vGain.connect(dest);

    const semis = (pad.pitchSemis || 0) + semiOffset;

    if (pad.source === 'synth' || !pad.sample) {
      const srcSec = Math.min(audibleEnd - t + 0.1, MAX_HOLD_SEC);
      playSynthVoice(ctx, vGain, pad.synthVoice || 'kick', t, 1, semis, srcSec);
      if (this.countForPad(padIdx) >= MAX_VOICES_PER_PAD) this.stealOldest(padIdx, t);
      this.live.push({ padIdx, choke: pad.choke, gain: vGain, src: null, releaseMs: env.releaseMs || 80, held: heldLive, endsAt: audibleEnd });
      return;
    }

    const buf = this.buffers.get(pad.sample.key);
    if (!buf) { try { vGain.disconnect(); } catch { /* */ } return; } // not resident — silent miss beats a late hit

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, semis / 12);
    src.connect(vGain);
    const rate = src.playbackRate.value || 1;
    const naturalEnd = t + Math.max(0, (buf.duration - (pad.startSec || 0)) / rate);
    // A sample can't sustain past its own material — the envelope holds, the buffer decides.
    const endsAt = Math.min(audibleEnd, naturalEnd);
    src.start(t, pad.startSec || 0);
    src.stop(Math.min(naturalEnd, audibleEnd + 0.05));

    if (this.countForPad(padIdx) >= MAX_VOICES_PER_PAD) this.stealOldest(padIdx, t);
    this.live.push({ padIdx, choke: pad.choke, gain: vGain, src, releaseMs: env.releaseMs || 80, held: heldLive, endsAt });
  }

  /** Note-off for held pads (pointer up / key up / MIDI note-off). */
  release(padIdx: number, when?: number): void {
    const t = Math.max(when ?? this.graph.ctx.currentTime, this.graph.ctx.currentTime);
    for (const v of this.live) {
      if (v.padIdx !== padIdx || !v.held || v.endsAt <= t) continue;
      v.held = false;
      const relSec = Math.max(0.005, v.releaseMs / 1000);
      try {
        const g = v.gain.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
        if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
        else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
        g.exponentialRampToValueAtTime(0.0001, t + relSec);
        v.src?.stop(t + relSec + 0.05);
      } catch { /* voice already ended */ }
      v.endsAt = t + relSec;
    }
  }

  stopAll(at?: number): void {
    const t = at ?? this.graph.ctx.currentTime;
    for (const v of this.live) this.kill(v, t);
    this.live = [];
  }

  // ---- internals ----

  private chokeGroup(group: number, t: number) {
    if (!group) return;
    for (const v of this.live) {
      if (v.choke === group && v.endsAt > t) this.kill(v, t);
    }
  }

  private kill(v: LiveVoice, t: number) {
    try {
      // cancelAndHold keeps the current value, then a short linear ramp to silence — the
      // click-free choke. (Fallback for engines without cancelAndHoldAtTime.)
      const g = v.gain.gain as AudioParam & { cancelAndHoldAtTime?: (t: number) => void };
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
      else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.linearRampToValueAtTime(0.0001, t + CHOKE_RAMP);
      v.src?.stop(t + CHOKE_RAMP + 0.02);
    } catch { /* voice already ended */ }
    v.endsAt = t;
    v.held = false;
  }

  private countForPad(padIdx: number): number {
    const now = this.graph.ctx.currentTime;
    let n = 0;
    for (const v of this.live) if (v.padIdx === padIdx && v.endsAt > now) n++;
    return n;
  }

  private stealOldest(padIdx: number, t: number) {
    let oldest: LiveVoice | null = null;
    for (const v of this.live) {
      if (v.padIdx !== padIdx || v.endsAt <= t) continue;
      if (!oldest || v.endsAt < oldest.endsAt) oldest = v;
    }
    if (oldest) this.kill(oldest, t);
  }

  private reap(now: number) {
    if (this.live.length < 64) return;
    this.live = this.live.filter((v) => v.endsAt > now - 0.1);
  }
}
