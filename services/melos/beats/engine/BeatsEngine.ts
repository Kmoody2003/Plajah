// Melos Beats — the engine singleton. ZERO React imports, ZERO Firebase imports (hard rule:
// the UI observes this through useEngineBridge's rAF loop; persistence lives in grooveStore).
// Context: 48kHz + 'interactive' latency hint, created lazily on the first user gesture and
// resumed on every gesture + visibilitychange (recipe: services/fabula/audioGraph.ts:40-104).

import clockUrl from './clockProcessor.worklet.js?url';
import type { ArrangeTrack, GrooveDoc, TimelineClip } from '../grooveDoc';
import { newGrooveDoc } from '../grooveDoc';
import { buildGraph, type BeatsGraph } from './graph';
import { VoiceBank } from './voices';
import { StepScheduler, type PlayMode, LOOKAHEAD_SEC } from './scheduler';
import { startAudioClipSource } from './clips';

export interface EngineDiagnostics {
  sampleRate: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  state: string;
  tickJitterMs: number;   // worst |arrival - expected| over the last ~2s of worklet ticks
  activeVoices: number;
  lookaheadMs: number;
  running: boolean;
}

interface LiveClipSource { src: AudioBufferSourceNode; gain: GainNode; }

export class BeatsEngine {
  private static _inst: BeatsEngine | null = null;
  static get(): BeatsEngine {
    if (!this._inst) this._inst = new BeatsEngine();
    return this._inst;
  }

  private ctx: AudioContext | null = null;
  private graph: BeatsGraph | null = null;
  private voices: VoiceBank | null = null;
  private scheduler: StepScheduler | null = null;
  private clock: AudioWorkletNode | null = null;
  private doc: GrooveDoc = newGrooveDoc('');
  private liveClipSources: LiveClipSource[] = [];

  // Transport: beats↔time anchoring. A live BPM change re-anchors at the current position, so
  // posBeats is continuous and only events beyond the lookahead window feel the new tempo.
  private running = false;
  private mode: PlayMode = 'pattern';
  private anchorBeats = 0;
  private anchorTime = 0;
  private secPerBeat = 0.5;

  // Diagnostics: worklet ticks should arrive every postEvery/sampleRate seconds of audio time;
  // jitter is how late the MESSAGE was relative to audio progress (main-thread health metric).
  private lastTickAudio = 0;
  private lastTickPerf = 0;
  private jitterWindow: number[] = [];

  // Pad-light feed for the UI bridge (written in the trigger path — plain array, no React).
  readonly lastHit: number[] = new Array(16).fill(0);

  isInitialized() { return !!this.ctx; }
  isRunning() { return this.running; }
  getDoc() { return this.doc; }
  getContext() { return this.ctx; }

  /** Gesture-gated: call from a pointer/key handler. Idempotent. */
  async init(): Promise<void> {
    if (this.ctx) { this.resume(); return; }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext;
    try { ctx = new Ctx({ latencyHint: 'interactive', sampleRate: 48000 }); }
    catch { ctx = new Ctx(); }
    this.ctx = ctx;
    this.installResumeOnGesture(ctx);

    await ctx.audioWorklet.addModule(clockUrl);
    const clock = new AudioWorkletNode(ctx, 'beats-clock', { numberOfInputs: 0, numberOfOutputs: 1 });
    // The node must be in the graph or process() never runs — a zero-gain sink keeps it silent.
    const sink = ctx.createGain(); sink.gain.value = 0;
    clock.connect(sink).connect(ctx.destination);
    clock.port.onmessage = (e) => this.onTick(e.data as { t: number; f: number });
    this.clock = clock;

    this.graph = buildGraph(ctx, 16);
    this.voices = new VoiceBank(this.graph);
    this.scheduler = new StepScheduler({
      doc: () => this.doc,
      toTime: (beats) => this.toTime(beats),
      secPerBeat: () => this.secPerBeat,
      rng: Math.random, // offline renders inject a seeded rng in render.ts instead
      trigger: (padIdx, vel, when, gateSec, semiOffset) => this.trigger(padIdx, vel, when, gateSec, semiOffset),
      startAudioClip: (track, clip, when, offset) => this.startAudioClip(track, clip, when, offset),
    });
    this.graph.applyDoc(this.doc);
  }

  loadDoc(doc: GrooveDoc): void {
    this.doc = doc;
    this.secPerBeat = 60 / (doc.bpm || 120);
    this.graph?.applyDoc(doc);
  }

  /**
   * Re-apply live edits (mixer moves, pad tweaks, bpm/swing) without stopping playback.
   * The UI mutates the shared doc object in place and calls this with {} — so BPM change is
   * detected by comparing the doc against the cached secPerBeat, not against the patch.
   */
  applyDocPatch(patch: Partial<GrooveDoc>): void {
    Object.assign(this.doc, patch);
    const wantSpb = 60 / (this.doc.bpm || 120);
    if (Math.abs(wantSpb - this.secPerBeat) > 1e-9) {
      // Re-anchor at the current position so the playhead is continuous across a tempo change.
      if (this.running && this.ctx) { this.anchorBeats = this.posBeats(); this.anchorTime = this.ctx.currentTime; }
      this.secPerBeat = wantSpb;
    }
    this.graph?.applyDoc(this.doc);
  }

  setSampleBuffer(key: string, buf: AudioBuffer): void { this.voices?.setBuffer(key, buf); }
  hasSampleBuffer(key: string): boolean { return !!this.voices?.hasBuffer(key); }
  getSampleEntries(): [string, AudioBuffer][] { return this.voices?.bufferEntries() ?? []; }

  /**
   * The live hit path — synchronous, no allocation beyond the voice itself, no React.
   * MIDI handlers and pad pointerdown call this directly. A live hit on a sustaining pad
   * (env.sustain > 0) HOLDS until release(padIdx); sequenced notes pass gateSec instead.
   */
  trigger(padIdx: number, vel127: number, when?: number, gateSec?: number, semiOffset?: number): void {
    if (!this.voices || !this.ctx) return;
    this.voices.trigger(this.doc, padIdx, vel127, when, gateSec, semiOffset);
    this.lastHit[padIdx] = performance.now();
  }

  /** Note-off for held pads (pointer up / key up / MIDI note-off). */
  release(padIdx: number, when?: number): void {
    this.voices?.release(padIdx, when);
  }

  play(mode: PlayMode, opts: { patternId?: string; fromBeats?: number } = {}): void {
    if (!this.ctx || !this.scheduler || !this.clock) return;
    this.resume();
    const from = opts.fromBeats ?? 0;
    this.mode = mode;
    this.secPerBeat = 60 / (this.doc.bpm || 120);
    // Anchor slightly ahead so the first step is scheduled inside the lookahead, never late.
    this.anchorBeats = from;
    this.anchorTime = this.ctx.currentTime + 0.1;
    this.running = true;
    this.jitterWindow.length = 0;
    this.lastTickAudio = 0;
    this.scheduler.start(mode, from, opts.patternId);
    this.clock.port.postMessage({ cmd: 'start' });
    // First window immediately — don't wait ~21ms for the first worklet tick.
    this.scheduler.onTick(this.ctx.currentTime);
  }

  stop(): void {
    this.running = false;
    this.clock?.port.postMessage({ cmd: 'stop' });
    this.scheduler?.stop();
    const t = this.ctx?.currentTime;
    this.voices?.stopAll(t);
    for (const c of this.liveClipSources) {
      try { c.gain.gain.setValueAtTime(c.gain.gain.value, t || 0); c.gain.gain.linearRampToValueAtTime(0.0001, (t || 0) + 0.01); c.src.stop((t || 0) + 0.03); } catch { /* */ }
    }
    this.liveClipSources = [];
  }

  posBeats(): number {
    if (!this.ctx || !this.running) return this.anchorBeats;
    return this.anchorBeats + (this.ctx.currentTime - this.anchorTime) / this.secPerBeat;
  }

  meters() { return this.graph ? this.graph.meters() : { groups: [0, 0, 0, 0], master: 0 }; }
  limiterReduction() { return this.graph?.limiterReduction() ?? 0; }

  diagnostics(): EngineDiagnostics {
    const c = this.ctx;
    let jitter = 0;
    for (const j of this.jitterWindow) if (j > jitter) jitter = j;
    return {
      sampleRate: c?.sampleRate ?? 0,
      baseLatencyMs: Math.round(((c as unknown as { baseLatency?: number })?.baseLatency || 0) * 100000) / 100,
      outputLatencyMs: Math.round(((c as unknown as { outputLatency?: number })?.outputLatency || 0) * 100000) / 100,
      state: c?.state ?? 'none',
      tickJitterMs: Math.round(jitter * 100) / 100,
      activeVoices: this.voices?.activeCount() ?? 0,
      lookaheadMs: LOOKAHEAD_SEC * 1000,
      running: this.running,
    };
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { /* */ });
  }

  dispose(): void {
    this.stop();
    try { this.clock?.disconnect(); } catch { /* */ }
    this.graph?.dispose();
    this.voices?.clearBuffers();
    try { this.ctx?.close(); } catch { /* */ }
    this.ctx = null; this.graph = null; this.voices = null; this.scheduler = null; this.clock = null;
    BeatsEngine._inst = null;
  }

  // ---- internals ----

  private toTime(beats: number): number {
    return this.anchorTime + (beats - this.anchorBeats) * this.secPerBeat;
  }

  private onTick(tick: { t: number; f: number }): void {
    if (!this.running) return;
    const perfNow = performance.now();
    if (this.lastTickAudio > 0) {
      const audioDeltaMs = (tick.t - this.lastTickAudio) * 1000;
      const perfDeltaMs = perfNow - this.lastTickPerf;
      this.jitterWindow.push(Math.abs(perfDeltaMs - audioDeltaMs));
      if (this.jitterWindow.length > 96) this.jitterWindow.shift(); // ~2s @ 21ms ticks
    }
    this.lastTickAudio = tick.t;
    this.lastTickPerf = perfNow;
    this.scheduler?.onTick(tick.t);
  }

  private startAudioClip(track: ArrangeTrack, clip: TimelineClip, when: number, offsetIntoClipSec: number): void {
    if (!this.ctx || !this.graph || !this.voices) return;
    const started = startAudioClipSource(
      this.ctx, this.graph, (k) => this.voices!.getBuffer(k), track, clip, when, offsetIntoClipSec, this.secPerBeat,
    );
    if (!started) return;
    this.liveClipSources.push(started);
    if (this.liveClipSources.length > 64) {
      this.liveClipSources = this.liveClipSources.filter((c) => { try { return c.gain.gain.value > 0; } catch { return false; } });
    }
  }

  private installResumeOnGesture(ctx: AudioContext): void {
    const evs = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];
    const resume = () => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* */ });
      if (ctx.state === 'running') evs.forEach((e) => window.removeEventListener(e, resume, true));
    };
    evs.forEach((e) => window.addEventListener(e, resume, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ctx.state === 'suspended') ctx.resume().catch(() => { /* */ });
    });
  }
}
