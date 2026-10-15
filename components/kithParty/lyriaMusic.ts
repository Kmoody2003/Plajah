/**
 * LyriaMusicController — Note-Driven Google Lyria RealTime (`models/lyria-realtime-exp`)
 * Co-Producer + Synchronized Web Audio Harmonic Stem Resonator for Kith Party.
 *
 * How Game Music Notes Drive Lyria:
 * 1. On every step of the game's music sequencer (`audio.ts`), a `MusicNoteEvent` is emitted
 *    containing the active MIDI melody note, chord notes, harmonic scale, bar/step index,
 *    BPM, active 3D course ID, and live kart telemetry (speed, drift tier, boost, 360° loop).
 * 2. The controller translates those musical note events into:
 *    - Live `setWeightedPrompts` and `setMusicGenerationConfig` updates for Google's
 *      `models/lyria-realtime-exp` (either via the zero-config server stream `/kith-party/lyria/*`
 *      or direct `@google/genai` `ai.live.music.connect` in the browser).
 *    - Real-time 48kHz 16-bit stereo PCM (`audio/l16;rate=48000;channels=2`) chunk scheduling
 *      into the shared Web Audio `musicBus`.
 *    - A sample-accurate Note-Driven Harmonic Accompaniment Synth (lush stereo chorus pad +
 *      shimmering counter-melody bell) driven by every `MusicNoteEvent`, guaranteeing instant
 *      musical responsiveness even while the neural stream buffers or when offline.
 */

import { GoogleGenAI, Scale } from '@google/genai';
import type { CourseId } from './course3d';
import type { MusicTrack } from './audio';

export interface MusicNoteEvent {
 track: MusicTrack;
 courseId: CourseId;
 step: number;
 bar: number;
 bpm: number;
 midiNote: number | null;
 bassNote: number | null;
 chordNotes: number[];
 scaleName: 'A_MINOR' | 'C_MAJOR' | 'D_MINOR' | 'E_MINOR' | 'F_MINOR';
 intensity: number;      // 0..1
 speedNorm: number;      // 0..1.5
 driftStage: number;     // 0..3
 boostActive: boolean;
 inLoop: boolean;
 lap: number;
}

export interface LyriaStatus {
 enabled: boolean;
 connected: boolean;
 mode: 'google-lyria-live' | 'note-driven-synth' | 'off';
 model: string;
 currentScale: string;
 lastNoteName: string;
 bpm: number;
 density: number;
 brightness: number;
 promptSummary: string;
 chunksStreamed: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToNoteName(midi: number | null): string {
 if (midi === null || !Number.isFinite(midi)) return '—';
 const name = NOTE_NAMES[((midi % 12) + 12) % 12];
 const oct = Math.floor(midi / 12) - 1;
 return `${name}${oct}`;
}

const mf = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const SCALE_TO_LYRIA: Record<MusicNoteEvent['scaleName'], Scale> = {
 C_MAJOR: Scale.C_MAJOR_A_MINOR,
 A_MINOR: Scale.C_MAJOR_A_MINOR,
 D_MINOR: Scale.F_MAJOR_D_MINOR,
 E_MINOR: Scale.G_MAJOR_E_MINOR,
 F_MINOR: Scale.A_FLAT_MAJOR_F_MINOR,
};

const COURSE_LYRIA_PROMPTS: Record<CourseId, string> = {
 'crestfall-gardens': 'Upbeat Mario Kart style orchestral synth-funk, bright brassy lead, slap bass, cherry blossom bell arpeggios, infectious happy racing groove',
 'abyssal-trench': 'Deep sea bioluminescent electronic racing soundtrack, liquid FM synth plucks, driving sub bass, shimmering crystal pads, high-energy arcade breakbeat',
 'dune-canyon': 'Desert canyon overdrive arcade racing theme, clavinet funk riff, warm analog brass, driving percussion, cinematic adventure synth hook',
 'polar-vortex': 'Arctic aurora eurobeat synthwave racing anthem, crystalline bell lead, fast arpeggiated bassline, euphoric festival chords, crisp drums',
 'amazon-canopy': 'Tropical jungle mountain speedway theme, infectious syncopated marimba synth lead, funky bass groove, tribal-arcade percussion, exhilarating loop-the-loop energy',
};

export class LyriaMusicController {
 private ctx: AudioContext | null = null;
 private outGain: GainNode | null = null;
 private enabled = true;
 private connected = false;
 private mode: LyriaStatus['mode'] = 'note-driven-synth';
 private session: any = null;
 private eventSource: EventSource | null = null;
 private nextPlayTime = 0;
 private chunksStreamed = 0;
 private lastSteerAt = 0;
 private lastNoteEvent: MusicNoteEvent | null = null;
 private recentNotes: string[] = [];
 private currentDensity = 0.72;
 private currentBrightness = 0.76;
 private currentPrompt = 'Infectious arcade kart racing synth funk';
 private listeners = new Set<(status: LyriaStatus) => void>();

 attach(ctx: AudioContext, destination: AudioNode): void {
  if (this.ctx === ctx && this.outGain) return;
  this.ctx = ctx;
  this.outGain = ctx.createGain();
  this.outGain.gain.value = this.enabled ? 0.85 : 0;
  this.outGain.connect(destination);
  if (this.enabled) {
   void this.connectLiveStream();
  }
 }

 subscribe(fn: (status: LyriaStatus) => void): () => void {
  this.listeners.add(fn);
  fn(this.getStatus());
  return () => this.listeners.delete(fn);
 }

 private notify(): void {
  const st = this.getStatus();
  this.listeners.forEach(fn => fn(st));
 }

 getStatus(): LyriaStatus {
  const ev = this.lastNoteEvent;
  return {
   enabled: this.enabled,
   connected: this.connected,
   mode: !this.enabled ? 'off' : this.connected ? 'google-lyria-live' : 'note-driven-synth',
   model: 'models/lyria-realtime-exp',
   currentScale: ev?.scaleName || 'A_MINOR',
   lastNoteName: midiToNoteName(ev?.midiNote ?? null),
   bpm: ev?.bpm || 132,
   density: Number(this.currentDensity.toFixed(2)),
   brightness: Number(this.currentBrightness.toFixed(2)),
   promptSummary: this.currentPrompt,
   chunksStreamed: this.chunksStreamed,
  };
 }

 setEnabled(on: boolean): void {
  this.enabled = on;
  if (this.ctx && this.outGain) {
   this.outGain.gain.setTargetAtTime(on ? 0.85 : 0.0001, this.ctx.currentTime, 0.06);
  }
  if (!on) {
   this.disconnectLiveStream();
   this.mode = 'off';
  } else {
   this.mode = this.connected ? 'google-lyria-live' : 'note-driven-synth';
   void this.connectLiveStream();
  }
  this.notify();
 }

 toggleEnabled(): boolean {
  this.setEnabled(!this.enabled);
  return this.enabled;
 }

 /**
  * Connects to Google Lyria RealTime (`models/lyria-realtime-exp`):
  * 1. First attempts our zero-config server SSE stream (`/kith-party/lyria/stream`) which uses
  *    the server's `.env.local` GEMINI_API_KEY safely on the backend.
  * 2. If a user has stored a browser key in `localStorage.getItem('kith-lyria-api-key')`,
  *    connects directly via `@google/genai` `ai.live.music.connect`.
  */
 async connectLiveStream(): Promise<void> {
  if (!this.enabled || this.connected || typeof window === 'undefined') return;

  // Option A: Try server-proxied Google Lyria RealTime SSE stream first (skip on static virtual host)
  if (window.location.hostname !== 'kith.local') {
   try {
    const probe = await fetch('/kith-party/lyria/status', { method: 'GET' }).catch(() => null);
    if (probe && probe.ok) {
     const info = await probe.json().catch(() => null);
     if (info?.available) {
      this.openServerEventStream();
      return;
     }
    }
   } catch {
    // Fall through to browser key or note-driven synth
   }
  }

  // Option B: Direct browser connection if user configured a local key
  const customKey =
   (typeof localStorage !== 'undefined' && localStorage.getItem('kith-lyria-api-key')) || '';
  if (customKey.trim().length > 10) {
   try {
    const ai = new GoogleGenAI({ apiKey: customKey.trim(), httpOptions: { apiVersion: 'v1alpha' } });
    this.session = await ai.live.music.connect({
     model: 'models/lyria-realtime-exp',
     callbacks: {
      onmessage: (msg: any) => {
       const chunks = msg?.serverContent?.audioChunks || (msg?.audioChunk ? [msg.audioChunk] : []);
       for (const ch of chunks) {
        if (ch?.data) this.enqueuePcmBase64(ch.data, 48000, 2);
       }
      },
      onerror: () => {
       this.connected = false;
       this.mode = this.enabled ? 'note-driven-synth' : 'off';
       this.notify();
      },
      onclose: () => {
       this.connected = false;
       this.mode = this.enabled ? 'note-driven-synth' : 'off';
       this.notify();
      },
     },
    });
    this.connected = true;
    this.mode = 'google-lyria-live';
    this.notify();
    await this.session.play();
   } catch {
    this.connected = false;
    this.mode = this.enabled ? 'note-driven-synth' : 'off';
    this.notify();
   }
  }
 }

 private openServerEventStream(): void {
  if (this.eventSource || typeof EventSource === 'undefined') return;
  try {
   const es = new EventSource('/kith-party/lyria/stream');
   this.eventSource = es;
   es.addEventListener('open', () => {
    this.connected = true;
    this.mode = 'google-lyria-live';
    this.notify();
   });
   es.addEventListener('audio', (ev: MessageEvent) => {
    try {
     const payload = JSON.parse(ev.data);
     if (payload?.data) {
      this.connected = true;
      this.mode = 'google-lyria-live';
      this.enqueuePcmBase64(payload.data, payload.sampleRate || 48000, payload.channels || 2);
     }
    } catch {}
   });
   es.addEventListener('error', () => {
    es.close();
    this.eventSource = null;
    this.connected = false;
    this.mode = this.enabled ? 'note-driven-synth' : 'off';
    this.notify();
   });
  } catch {
   this.connected = false;
  }
 }

 disconnectLiveStream(): void {
  if (this.eventSource) {
   try { this.eventSource.close(); } catch {}
   this.eventSource = null;
  }
  if (this.session) {
   try { this.session.close(); } catch {}
   this.session = null;
  }
  this.connected = false;
 }

 /**
  * Decodes base64 16-bit signed little-endian stereo PCM (`audio/l16;rate=48000;channels=2`)
  * from Google Lyria RealTime and schedules gapless playback on `this.outGain`.
  */
 private enqueuePcmBase64(b64: string, sampleRate = 48000, channels = 2): void {
  const ctx = this.ctx, out = this.outGain;
  if (!ctx || !out || !this.enabled) return;
  try {
   const bin = atob(b64);
   const byteLen = bin.length;
   const samplesTotal = byteLen >> 1;
   const frames = Math.floor(samplesTotal / channels);
   if (frames <= 0) return;

   const audioBuf = ctx.createBuffer(channels, frames, sampleRate);
   const ch0 = audioBuf.getChannelData(0);
   const ch1 = channels > 1 ? audioBuf.getChannelData(1) : ch0;

   let byteIdx = 0;
   for (let f = 0; f < frames; f++) {
    const lo0 = bin.charCodeAt(byteIdx++);
    const hi0 = bin.charCodeAt(byteIdx++);
    let s0 = (hi0 << 8) | lo0;
    if (s0 & 0x8000) s0 -= 0x10000;
    ch0[f] = s0 / 32768;

    if (channels > 1) {
     const lo1 = bin.charCodeAt(byteIdx++);
     const hi1 = bin.charCodeAt(byteIdx++);
     let s1 = (hi1 << 8) | lo1;
     if (s1 & 0x8000) s1 -= 0x10000;
     ch1[f] = s1 / 32768;
    }
   }

   const src = ctx.createBufferSource();
   src.buffer = audioBuf;
   const streamGain = ctx.createGain();
   streamGain.gain.value = 0.42;
   src.connect(streamGain);
   streamGain.connect(out);

   const now = ctx.currentTime;
   if (this.nextPlayTime < now + 0.04) {
    this.nextPlayTime = now + 0.06;
   }
   src.start(this.nextPlayTime);
   this.nextPlayTime += audioBuf.duration;
   this.chunksStreamed++;
   this.notify();
  } catch {}
 }

 /**
  * Called on EVERY 16th-note step of `GameAudio` (`audio.ts`).
  * Uses the exact MIDI notes, chord voicings, and race telemetry to:
  * 1. Play a synchronized Lyria harmonic counter-voice & lush pad in Web Audio.
  * 2. Steer Google's `models/lyria-realtime-exp` session with note-contour weighted prompts,
  *    harmonic scale, BPM, density, and brightness!
  */
 onNoteStep(ev: MusicNoteEvent, scheduleTime: number, stepDur: number): void {
  this.lastNoteEvent = ev;
  if (ev.midiNote !== null) {
   const nName = midiToNoteName(ev.midiNote);
   this.recentNotes.push(nName);
   if (this.recentNotes.length > 8) this.recentNotes.shift();
  }

  // Compute note-driven density & brightness from musical register + race telemetry
  const pitchFactor = ev.midiNote ? Math.min(1, Math.max(0, (ev.midiNote - 55) / 30)) : 0.5;
  this.currentDensity = Math.min(
   0.96,
   0.48 + ev.intensity * 0.24 + ev.speedNorm * 0.14 + (ev.boostActive ? 0.12 : 0) + ev.driftStage * 0.04
  );
  this.currentBrightness = Math.min(
   0.98,
   0.52 + pitchFactor * 0.22 + (ev.boostActive ? 0.16 : 0) + (ev.inLoop ? 0.12 : 0) + (ev.lap >= 3 ? 0.08 : 0)
  );

  // 1. Trigger synchronized Web Audio Note-Driven Harmonic Layer
  if (this.enabled && this.ctx && this.outGain) {
   this.synthesizeNoteDrivenHarmony(ev, scheduleTime, stepDur);
  }

  // 2. Steer Google Lyria RealTime (`models/lyria-realtime-exp`) at bar boundaries or major state shifts
  const nowMs = Date.now();
  if (this.enabled && (ev.step % 16 === 0 || nowMs - this.lastSteerAt > 2400)) {
   this.lastSteerAt = nowMs;
   void this.steerLiveLyria(ev);
  } else if (ev.step % 4 === 0) {
   this.notify();
  }
 }

 private synthesizeNoteDrivenHarmony(ev: MusicNoteEvent, t: number, stepDur: number): void {
  const ctx = this.ctx, out = this.outGain;
  if (!ctx || !out) return;

  // (A) Lush Stereo Detuned Chord Pad on beat 0 and beat 8 of each bar
  if (ev.step % 8 === 0 && ev.chordNotes.length > 0) {
   const padDur = stepDur * 7.8;
   ev.chordNotes.forEach((midi, idx) => {
    const osc = ctx.createOscillator();
    osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
    // Add 9th/octave shimmer when boosting or in a 360° loop
    const noteMidi = (ev.boostActive || ev.inLoop) && idx === ev.chordNotes.length - 1 ? midi + 12 : midi;
    osc.frequency.setValueAtTime(mf(noteMidi), t);
    osc.detune.setValueAtTime((idx - 1) * 9, t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = 900 + this.currentBrightness * 2400;
    filter.frequency.setValueAtTime(cutoff * 0.6, t);
    filter.frequency.exponentialRampToValueAtTime(cutoff, t + padDur * 0.45);

    const g = ctx.createGain();
    const peak = 0.032 * (0.7 + this.currentDensity * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, t + padDur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + padDur + 0.04);
   });
  }

  // (B) Note-Driven Bell / Harmonic Counter-Voice answering the main melody note
  if (ev.midiNote !== null && (ev.step % 2 === 1 || ev.boostActive || ev.driftStage >= 2)) {
   const harmonyInterval = ev.boostActive || ev.inLoop ? 12 : ev.step % 4 === 1 ? 7 : 4;
   const targetMidi = ev.midiNote + harmonyInterval;
   const osc = ctx.createOscillator();
   osc.type = 'sine';
   osc.frequency.setValueAtTime(mf(targetMidi), t);

   const sub = ctx.createOscillator();
   sub.type = 'triangle';
   sub.frequency.setValueAtTime(mf(targetMidi) * 2, t);

   const g = ctx.createGain();
   const bellVol = 0.036 * this.currentBrightness;
   g.gain.setValueAtTime(0.0001, t);
   g.gain.exponentialRampToValueAtTime(Math.max(0.001, bellVol), t + 0.008);
   g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 1.9);

   osc.connect(g);
   sub.connect(g);
   g.connect(out);
   osc.start(t);
   sub.start(t);
   osc.stop(t + stepDur * 2.0);
   sub.stop(t + stepDur * 2.0);
  }
 }

 private async steerLiveLyria(ev: MusicNoteEvent): Promise<void> {
  const basePrompt = ev.track === 'menu'
   ? 'Bouncy cheerful Nintendo-style party lobby groove, warm electric piano, Rhodes chords, playful bassline'
   : ev.track === 'groove'
   ? 'Infectious upbeat arcade funk-pop groove, slap bass, crisp drums, bright clavinet and synth brass'
   : COURSE_LYRIA_PROMPTS[ev.courseId] || COURSE_LYRIA_PROMPTS['crestfall-gardens'];

  const motifNotes = this.recentNotes.slice(-6).join('-');
  const noteSteerPrompt = `Melodic motif notes ${motifNotes || 'A4-C5-E5'} in ${ev.scaleName.replace('_', ' ')}, chord root ${midiToNoteName(ev.bassNote)}`;
  const telemetryPrompt = ev.inLoop
   ? 'Soaring anti-gravity 360 loop synth riser, euphoric harmonic lead'
   : ev.boostActive
   ? 'High-octane turbo boost overdrive lead, rapid 16th-note synth arpeggio'
   : ev.driftStage >= 2
   ? 'Syncopated funk drift groove with bright brass stabs and filter sweep'
   : 'Tight infectious racing rhythm section with melodic hook';

  this.currentPrompt = `${basePrompt.split(',')[0]} · Notes: ${motifNotes || 'A4-C5-E5'}`;
  this.notify();

  const weightedPrompts = [
   { text: basePrompt, weight: 1.0 },
   { text: noteSteerPrompt, weight: 0.85 },
   { text: telemetryPrompt, weight: ev.boostActive || ev.inLoop ? 0.95 : 0.55 },
  ];
  const scaleEnum = SCALE_TO_LYRIA[ev.scaleName] || Scale.C_MAJOR_A_MINOR;
  const config = {
   bpm: Math.round(ev.bpm),
   scale: scaleEnum,
   density: this.currentDensity,
   brightness: this.currentBrightness,
   guidance: 4.2,
  };

  // Steer direct browser session if active
  if (this.session) {
   try {
    await this.session.setWeightedPrompts({ weightedPrompts });
    await this.session.setMusicGenerationConfig({ musicGenerationConfig: config });
   } catch {}
  }

  // Steer server-proxied session if active
  if (this.eventSource && this.connected) {
   try {
    await fetch('/kith-party/lyria/steer', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ weightedPrompts, musicGenerationConfig: config }),
    });
   } catch {}
  }
 }
}

export const lyriaMusic = new LyriaMusicController();
