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
import { Instrument } from './InstrumentHost';
import type { ArrangeTrack as ATrack, NoteEvent } from '../grooveDoc';
import { arpStep, defaultArpPatch, type ArpPatch } from '../../arp';

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

  // One Instrument (worklet node + Rust engine) per instrument track, connected into the same
  // track strips audio clips use — the bus architecture doesn't change for instruments.
  private instruments = new Map<string, Instrument>();
  private instrumentLoading = new Set<string>();
  /** Notes started live from the keyboard/MIDI, so a key-up can find its voice. */
  private liveNotes = new Map<string, number>();
  /** Keys feeding each track's arp: `keys` is the held set, `order` preserves press order. */
  private heldKeys = new Map<string, { keys: number[]; order: number[] }>();
  private arpPrevFired = new Map<string, boolean>();
  private arpFill = false;

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
      startInstrumentNote: (track, note, when, durSec) => this.startInstrumentNote(track, note, when, durSec),
      runArp: (track, stepIndex, beat) => this.runArp(track, stepIndex, beat),
      arpActive: (track) => this.arpIsActive(track),
    });
    this.graph.applyDoc(this.doc);
  }

  loadDoc(doc: GrooveDoc): void {
    this.doc = doc;
    this.secPerBeat = 60 / (doc.bpm || 120);
    this.graph?.applyDoc(doc);
    if (this.ctx) this.syncInstruments();
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
      const bps = 1 / this.secPerBeat;
      for (const inst of this.instruments.values()) inst.setTempo(bps);
    }
    this.graph?.applyDoc(this.doc);
    if (this.ctx) this.syncInstruments();
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

  // ── Instruments ─────────────────────────────────────────────────────────────

  /**
   * Ensure a track's instrument exists and is connected. Idempotent and safe to call from
   * render/effect paths — instantiation is async (the wasm module compiles once per page) so the
   * first note on a brand-new track may be silent; every note after it is not.
   */
  async ensureInstrument(track: ATrack): Promise<Instrument | null> {
    if (track.kind !== 'instrument') return null;
    const existing = this.instruments.get(track.id);
    if (existing) return existing;
    if (this.instrumentLoading.has(track.id)) return null;
    this.instrumentLoading.add(track.id);
    try {
      await this.init();
      if (!this.ctx || !this.graph) return null;
      const inst = await Instrument.create(this.ctx, {
        onError: (m) => console.warn('[beats] instrument error', track.name, m),
      });
      inst.output.connect(this.graph.trackDestination(track));
      inst.setTempo((this.doc.bpm || 120) / 60);
      if (track.position) inst.setSpatial({ position: track.position });
      // Load the track's saved patch. Imported lazily so the ONDA preset bank and its wavetable
      // generators aren't pulled into the engine chunk for users who never open an instrument.
      if (track.instrument?.patch) {
        const [{ deserializePatch, applyPatch }] = await Promise.all([
          import('../../instruments/onda/patch'),
        ]);
        const patch = deserializePatch(track.instrument.patch);
        if (patch) applyPatch(inst, patch);
      }
      this.instruments.set(track.id, inst);
      return inst;
    } catch (e) {
      console.warn('[beats] instrument create failed', e);
      return null;
    } finally {
      this.instrumentLoading.delete(track.id);
    }
  }

  getInstrument(trackId: string): Instrument | null {
    return this.instruments.get(trackId) ?? null;
  }

  /** The track your keyboard plays. Exactly one, or none. */
  armedTrack(): ATrack | null {
    return this.doc.arrangement.find((t) => t.kind === 'instrument' && t.armed) ?? null;
  }

  /** Reload a track's patch into its live instrument (preset change, macro edit). */
  async reloadPatch(track: ATrack): Promise<void> {
    const inst = this.instruments.get(track.id);
    if (!inst || !track.instrument?.patch) return;
    const { deserializePatch, applyPatch } = await import('../../instruments/onda/patch');
    const patch = deserializePatch(track.instrument.patch);
    if (patch) applyPatch(inst, patch);
  }

  /** Drop instruments whose track no longer exists — called after doc edits. */
  syncInstruments(): void {
    const live = new Set(this.doc.arrangement.filter((t) => t.kind === 'instrument').map((t) => t.id));
    for (const [id, inst] of this.instruments) {
      if (!live.has(id)) {
        inst.dispose();
        this.instruments.delete(id);
      }
    }
    for (const t of this.doc.arrangement) {
      if (t.kind === 'instrument' && !this.instruments.has(t.id)) void this.ensureInstrument(t);
    }
  }

  /** Live keyboard/MIDI note on an instrument track. Returns the voice id for the matching off. */
  instrumentNoteOn(track: ATrack, key: number, vel127: number): void {
    // With the Arp armed the keyboard FEEDS it rather than sounding directly — holding a chord
    // is the gesture, and the arp turns it into a performance on the transport grid.
    const arp = this.arpFor(track);
    // The arp only produces notes while the transport runs (it's driven by the step clock). When
    // stopped, feed the note to the arp's held set AND sound it directly, so holding a key always
    // makes sound — pressing play then hands the performance to the arp.
    if (arp?.enabled) {
      const held = this.heldKeys.get(track.id) || { keys: [], order: [] };
      if (!held.keys.includes(key)) { held.keys.push(key); held.order.push(key); }
      this.heldKeys.set(track.id, held);
      if (this.running) return; // playing: the arp owns the sound
    }
    const inst = this.instruments.get(track.id);
    if (!inst || !this.ctx) { void this.ensureInstrument(track); return; }
    const id = inst.noteOn(key, Math.max(0.05, vel127 / 127), this.ctx.currentTime, this.ctx.currentTime, this.ctx.sampleRate);
    this.liveNotes.set(`${track.id}:${key}`, id);
  }

  instrumentNoteOff(track: ATrack, key: number): void {
    const arp = this.arpFor(track);
    if (arp?.enabled) {
      const held = this.heldKeys.get(track.id);
      if (held && !arp.latch) {
        held.keys = held.keys.filter((k) => k !== key);
        held.order = held.order.filter((k) => k !== key);
      }
      return;
    }
    const inst = this.instruments.get(track.id);
    if (!inst) return;
    const k = `${track.id}:${key}`;
    const id = this.liveNotes.get(k);
    if (id === undefined) return;
    this.liveNotes.delete(k);
    inst.noteOff(id, true);
  }

  /** Keys currently feeding a track's arp — the UI highlights them on its keyboard. */
  heldFor(trackId: string): number[] {
    return this.heldKeys.get(trackId)?.keys ?? [];
  }

  clearHeld(trackId: string): void {
    this.heldKeys.delete(trackId);
  }

  /** Fill is a momentary performance control: hold it and `fill` trig conditions fire. */
  setArpFill(on: boolean): void {
    this.arpFill = on;
  }

  private arpFor(track: ATrack): ArpPatch | null {
    const raw = track.instrument?.arp;
    if (!raw) return null;
    return { ...defaultArpPatch(), ...(raw as Partial<ArpPatch>) } as ArpPatch;
  }

  /**
   * One arp step for one track. Returns true when the arp owns this step.
   * The arp itself is pure — it holds no playback state — so this only supplies held keys and
   * routes the notes it returns.
   */
  /** True when the track has an enabled arp — used by the scheduler to skip its clip notes. */
  arpIsActive(track: ATrack): boolean {
    return !!this.arpFor(track)?.enabled;
  }

  /**
   * PANIC — cut every sounding voice immediately. The safety net for a synth note whose note-off
   * got lost (a dropped MIDI message, a held key on a focus change, a sustained patch left
   * ringing). Stops the transport, silences pads, hard-kills every instrument voice and clears
   * the held-key and arp state so nothing re-triggers.
   */
  panic(): void {
    this.stop();
    this.voices?.stopAll(this.ctx?.currentTime);
    for (const inst of this.instruments.values()) inst.allNotesOff(true);
    this.heldKeys.clear();
    this.arpPrevFired.clear();
    this.liveNotes.clear();
    this.arpFill = false;
  }

  private runArp(track: ATrack, stepIndex: number, beat: number): void {
    const arp = this.arpFor(track);
    if (!arp?.enabled) return;
    const held = this.heldKeys.get(track.id);
    if (!held?.keys.length) return; // armed but nothing held — nothing to arpeggiate

    const prev = this.arpPrevFired.get(track.id) ?? false;
    const res = arpStep(arp, held.keys, held.order, stepIndex, { fill: this.arpFill, prevFired: prev });
    this.arpPrevFired.set(track.id, res.played);

    const inst = this.instruments.get(track.id);
    if (!inst || !this.ctx) return;

    for (const n of res.notes) {
      const when = this.toTime(beat + n.offsetBeats);
      // Parameter locks hold for the step: set on the way in, restored after it passes.
      for (const lock of n.locks) inst.setParam(lock.paramId, lock.value);
      const voiceId = inst.noteOn(n.key, Math.max(0.05, n.velocity / 127), when, this.ctx.currentTime, this.ctx.sampleRate);
      const offIn = Math.max(0, (when - this.ctx.currentTime) + n.durationBeats * this.secPerBeat) * 1000;
      setTimeout(() => inst.noteOff(voiceId, true), offIn);
      if (n.locks.length) {
        const patch = track.instrument?.patch as { params?: Record<number, number> } | undefined;
        setTimeout(() => {
          for (const lock of n.locks) inst.setParam(lock.paramId, patch?.params?.[lock.paramId] ?? 0);
        }, offIn + 5);
      }
    }
  }

  /** Per-note expression from an MPE controller. */
  instrumentExpression(track: ATrack, key: number, bend: number, pressure: number, timbre: number): void {
    const inst = this.instruments.get(track.id);
    const id = this.liveNotes.get(`${track.id}:${key}`);
    if (inst && id !== undefined) inst.setExpression(id, bend, pressure, timbre);
  }

  private startInstrumentNote(track: ATrack, note: NoteEvent, when: number, durSec: number): void {
    const inst = this.instruments.get(track.id);
    if (!inst || !this.ctx) return;
    const voiceId = inst.noteOn(note.key, Math.max(0.05, note.vel / 127), when, this.ctx.currentTime, this.ctx.sampleRate);
    if (note.expr) inst.setExpression(voiceId, note.expr.bend ?? 0, note.expr.pressure ?? 0, note.expr.timbre ?? 0);
    // Schedule the note-off. The engine's own release stage shapes the tail; this just gates it.
    const offIn = Math.max(0, (when - this.ctx.currentTime) + durSec) * 1000;
    setTimeout(() => inst.noteOff(voiceId, true), offIn);
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
    for (const inst of this.instruments.values()) inst.allNotesOff();
    this.liveNotes.clear();
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
    for (const inst of this.instruments.values()) inst.dispose();
    this.instruments.clear();
    this.liveNotes.clear();
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
