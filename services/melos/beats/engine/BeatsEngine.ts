// Melos Beats — the engine singleton. ZERO React imports, ZERO Firebase imports (hard rule:
// the UI observes this through useEngineBridge's rAF loop; persistence lives in grooveStore).
// Context: 48kHz + 'interactive' latency hint, created lazily on the first user gesture and
// resumed on every gesture + visibilitychange (recipe: services/fabula/audioGraph.ts:40-104).

import clockUrl from './clockProcessor.worklet.js?url';
import loudnessUrl from './loudnessProcessor.worklet.js?url';
import type { ArrangeTrack, GrooveDoc, PadConfig, TimelineClip } from '../grooveDoc';
import { newGrooveDoc } from '../grooveDoc';
import { buildGraph, type BeatsGraph } from './graph';
import { VoiceBank } from './voices';
import { StepScheduler, type PlayMode, LOOKAHEAD_SEC } from './scheduler';
import { startAudioClipSource } from './clips';
import { Instrument } from './InstrumentHost';
import type { ArrangeTrack as ATrack, NoteEvent } from '../grooveDoc';
import { arpStep, defaultArpPatch, type ArpPatch } from '../../arp';
import type { KeraProgram } from '../../instruments/kera/zones';
import { deserializeKeraProgram, type SerializedKeraProgram } from '../../instruments/kera/persist';
import { SpectraEQ, defaultSpectra, type SpectraState } from '../fx/spectraEq';
import { MasteringChain, defaultMastering, type MasteringState } from '../fx/mastering';
import { FxChainHost, type FxInstance } from '../fx/devices';

/** BS.1770 snapshot from the loudness worklet. LUFS fields are -Infinity until signal flows. */
export interface LoudnessSnapshot {
  m: number;     // momentary (400 ms) LUFS
  s: number;     // short-term (3 s) LUFS
  i: number;     // integrated (gated) LUFS
  lra: number;   // loudness range, LU
  tp: number;    // true peak, dBTP (max-hold; reset on play)
  corr: number;  // stereo correlation -1..1
  xy?: number[]; // goniometer feed: interleaved L,R pairs, ~64:1 decimated
}

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
  /** Live-held instrument-pad notes (padIdx → the voice sounding), so a pad release finds it. */
  private padLiveNotes = new Map<number, { trackId: string; note: number; voiceId: number; kera: boolean }>();
  /** Keys feeding each track's arp: `keys` is the held set, `order` preserves press order. */
  private heldKeys = new Map<string, { keys: number[]; order: number[] }>();
  private arpPrevFired = new Map<string, boolean>();
  private arpFill = false;

  // Transport: beats↔time anchoring. A live BPM change re-anchors at the current position, so
  // posBeats is continuous and only events beyond the lookahead window feel the new tempo.
  private running = false;
  private mode: PlayMode = 'pattern';
  private currentPatternId: string | undefined;
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

    // Loudness meter (BS.1770) tapped off the very end of the master chain — it measures what
    // actually leaves the app, limiter and all. Same keep-alive sink trick as the clock.
    try {
      await ctx.audioWorklet.addModule(loudnessUrl);
      const loud = new AudioWorkletNode(ctx, 'beats-loudness', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2 });
      this.graph.master.makeup.connect(loud);
      loud.connect(sink);
      loud.port.onmessage = (e) => { this.loudnessSnap = e.data as LoudnessSnapshot; };
      this.loudnessNode = loud;
    } catch (e) {
      console.warn('[beats] loudness meter unavailable', e);
    }
    this.voices = new VoiceBank(this.graph);
    this.scheduler = new StepScheduler({
      doc: () => this.doc,
      toTime: (beats) => this.toTime(beats),
      secPerBeat: () => this.secPerBeat,
      rng: Math.random, // offline renders inject a seeded rng in render.ts instead
      // Forward pan + stepFx too — the scheduler passes step.pan/step.fx, and dropping them here
      // is why per-step Step Effects (and per-step pan) applied on Audition but were dry on playback.
      trigger: (padIdx, vel, when, gateSec, semiOffset, pan, stepFx) => this.trigger(padIdx, vel, when, gateSec, semiOffset, pan, stepFx),
      startAudioClip: (track, clip, when, offset) => this.startAudioClip(track, clip, when, offset),
      startInstrumentNote: (track, note, when, durSec) => this.startInstrumentNote(track, note, when, durSec),
      runArp: (track, stepIndex, beat) => this.runArp(track, stepIndex, beat),
      arpActive: (track) => this.arpIsActive(track),
      loop: () => this.doc.loop ?? null,
    });
    this.graph.applyDoc(this.doc);
    this.syncMixerFx();
  }

  // ── Mixer insert + send FX (fx/devices.ts chains on EVERY channel) ──────────
  private groupInserts: (FxChainHost | null)[] = [null, null, null, null];
  private sendInserts: (FxChainHost | null)[] = [null, null];
  private padInserts = new Map<number, FxChainHost>();
  private trackInserts = new Map<string, FxChainHost>();

  /** Reconcile every channel's insert chain, send level and return from the doc (source of truth). */
  private syncMixerFx(): void {
    if (!this.ctx || !this.graph) return;
    const g = this.graph;
    const mixer = this.doc.mixer;

    // Per-pad inserts + sends (Bitwig/S1 parity: every channel).
    this.doc.kit.forEach((pad, i) => {
      const inserts = pad.inserts ?? [];
      if (inserts.some((f) => f.on)) {
        let host = this.padInserts.get(i);
        if (!host) { host = new FxChainHost(this.ctx!); this.padInserts.set(i, host); g.setPadInsert(i, host.input, host.output); }
        host.setChain(inserts);
      } else if (this.padInserts.has(i)) {
        g.clearPadInsert(i); this.padInserts.get(i)!.dispose(); this.padInserts.delete(i);
      }
      const sends = pad.sends ?? [];
      for (let s = 0; s < 2; s++) g.setPadSend(i, s, sends[s] ?? 0);
    });

    // Per-track inserts + sends.
    const liveTrackIds = new Set(this.doc.arrangement.filter((t) => t.kind === 'audio').map((t) => t.id));
    for (const [id, host] of [...this.trackInserts]) {
      if (!liveTrackIds.has(id)) { g.clearTrackInsert(id); host.dispose(); this.trackInserts.delete(id); }
    }
    for (const t of this.doc.arrangement) {
      if (t.kind !== 'audio') continue;
      const inserts = t.inserts ?? [];
      if (inserts.some((f) => f.on)) {
        let host = this.trackInserts.get(t.id);
        if (!host) { host = new FxChainHost(this.ctx!); this.trackInserts.set(t.id, host); g.setTrackInsert(t.id, host.input, host.output); }
        host.setChain(inserts);
      } else if (this.trackInserts.has(t.id)) {
        g.clearTrackInsert(t.id); this.trackInserts.get(t.id)!.dispose(); this.trackInserts.delete(t.id);
      }
      const sends = t.sends ?? [];
      for (let s = 0; s < 2; s++) g.setTrackSend(t.id, s, sends[s] ?? 0);
    }

    this.syncStepFx();
    // Group inserts + sends.
    mixer.groups.forEach((ch, i) => {
      const inserts = ch.inserts ?? [];
      if (inserts.some((f) => f.on)) {
        let host = this.groupInserts[i];
        if (!host) { host = new FxChainHost(this.ctx!); this.groupInserts[i] = host; this.graph!.setGroupInsert(i, host.input, host.output); }
        host.setChain(inserts);
      } else if (this.groupInserts[i]) {
        this.graph!.clearGroupInsert(i);
        this.groupInserts[i]!.dispose();
        this.groupInserts[i] = null;
      }
      const sends = ch.sends ?? [];
      for (let s = 0; s < 2; s++) this.graph!.setGroupSend(i, s, sends[s] ?? 0);
    });
    // Send-bus returns + their inserts.
    const buses = mixer.sendBuses ?? [];
    for (let s = 0; s < 2; s++) {
      this.graph!.setSendReturnGain(s, buses[s]?.gainDb ?? 0);
      const inserts = buses[s]?.inserts ?? [];
      if (inserts.some((f) => f.on)) {
        let host = this.sendInserts[s];
        if (!host) { host = new FxChainHost(this.ctx!); this.sendInserts[s] = host; this.graph!.setSendInsert(s, host.input, host.output); }
        host.setChain(inserts);
      } else if (this.sendInserts[s]) {
        this.graph!.clearSendInsert(s);
        this.sendInserts[s]!.dispose();
        this.sendInserts[s] = null;
      }
    }
  }

  /** Live send-bus peak meters, for the mixer UI. */
  sendMeters(): number[] { return this.graph?.sendMeters() ?? [0, 0]; }
  padMeter(padIdx: number): number { return this.graph?.padMeter(padIdx) ?? 0; }
  trackMeter(trackId: string): number { return this.graph?.trackMeter(trackId) ?? 0; }
  /** A live insert device on a group bus (for its scope). */
  groupInsertNode(groupIdx: number, id: string) { return this.groupInserts[groupIdx]?.nodeOf(id); }
  groupInsertReduction(groupIdx: number, id: string): number { return this.groupInserts[groupIdx]?.reductionOf(id) ?? 0; }
  /** A live insert device on a send bus. */
  sendInsertNode(sendIdx: number, id: string) { return this.sendInserts[sendIdx]?.nodeOf(id); }
  sendInsertReduction(sendIdx: number, id: string): number { return this.sendInserts[sendIdx]?.reductionOf(id) ?? 0; }
  /** Live insert devices on pad / track channels. */
  padInsertNode(padIdx: number, id: string) { return this.padInserts.get(padIdx)?.nodeOf(id); }
  padInsertReduction(padIdx: number, id: string): number { return this.padInserts.get(padIdx)?.reductionOf(id) ?? 0; }
  trackInsertNode(trackId: string, id: string) { return this.trackInserts.get(trackId)?.nodeOf(id); }
  trackInsertReduction(trackId: string, id: string): number { return this.trackInserts.get(trackId)?.reductionOf(id) ?? 0; }
  /** Live device on a pad's step-FX slot chain (for its scope). */
  stepFxNode(padIdx: number, slotId: string, id: string) { return this.stepFxHosts.get(`${padIdx}:${slotId}`)?.nodeOf(id); }

  loadDoc(doc: GrooveDoc): void {
    this.doc = doc;
    this.secPerBeat = 60 / (doc.bpm || 120);
    this.graph?.applyDoc(doc);
    if (this.ctx) { this.syncInstruments(); this.syncMasterEq(); this.syncMastering(); }
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
    if (this.ctx) { this.syncInstruments(); this.syncMixerFx(); }
  }

  setSampleBuffer(key: string, buf: AudioBuffer): void { this.voices?.setBuffer(key, buf); }
  hasSampleBuffer(key: string): boolean { return !!this.voices?.hasBuffer(key); }
  getSampleEntries(): [string, AudioBuffer][] { return this.voices?.bufferEntries() ?? []; }

  /**
   * The live hit path — synchronous, no allocation beyond the voice itself, no React.
   * MIDI handlers and pad pointerdown call this directly. A live hit on a sustaining pad
   * (env.sustain > 0) HOLDS until release(padIdx); sequenced notes pass gateSec instead.
   */
  trigger(padIdx: number, vel127: number, when?: number, gateSec?: number, semiOffset?: number, pan?: number, stepFx?: number): void {
    if (!this.voices || !this.ctx) return;
    const pad = this.doc.kit[padIdx];
    if (pad?.empty) return; // greyed placeholder pad — no sound
    // An instrument pad plays a full ONDA/KERA voice at its base note instead of a one-shot.
    if (pad?.source === 'instrument' && pad.instrumentTrackId) {
      this.triggerPadInstrument(pad, padIdx, vel127, when, gateSec, semiOffset ?? 0);
      this.lastHit[padIdx] = performance.now();
      return;
    }
    // Step Effects: route this hit through the referenced per-pad slot's chain (feature 2).
    const dest = this.stepFxDestFor(padIdx, stepFx);
    this.voices.trigger(this.doc, padIdx, vel127, when, gateSec, semiOffset, pan, dest);
    this.lastHit[padIdx] = performance.now();
  }

  // ── Step Effects (per-pad "step FX" slots — a bounded set of device chains) ──
  private stepFxHosts = new Map<string, FxChainHost>(); // `${padIdx}:${slotId}` → host

  /** The chain input a step should route to, or undefined for dry. Reconciled in syncStepFx. */
  private stepFxDestFor(padIdx: number, slotIdx: number | undefined): AudioNode | undefined {
    if (slotIdx === undefined) return undefined;
    const pad = this.doc.kit[padIdx];
    if (!pad || pad.stepFxOn === false) return undefined;
    const slot = pad.stepFx?.[slotIdx];
    if (!slot) return undefined;
    return this.stepFxHosts.get(`${padIdx}:${slot.id}`)?.input;
  }

  /** Build/refresh each pad's step-FX slot chains and their routing. */
  private syncStepFx(): void {
    if (!this.ctx || !this.graph) return;
    const want = new Set<string>();
    this.doc.kit.forEach((pad, padIdx) => {
      const isInstrument = pad.source === 'instrument' && !!pad.instrumentTrackId;
      const instTrack = isInstrument ? this.doc.arrangement.find((t) => t.id === pad.instrumentTrackId && t.kind === 'instrument') : undefined;
      // Where a slot's DRY output returns: an instrument pad routes back through its OWN track strip
      // (a padOwned instrument never used the pad channel), a one-shot pad through the pad bus so
      // its fader/mute still apply.
      const dryDest: AudioNode = isInstrument && instTrack ? this.graph!.trackDestination(instTrack) : this.graph!.padDestination(padIdx);
      (pad.stepFx ?? []).forEach((slot) => {
        const key = `${padIdx}:${slot.id}`;
        want.add(key);
        let host = this.stepFxHosts.get(key);
        if (!host) { host = new FxChainHost(this.ctx!); this.stepFxHosts.set(key, host); }
        host.setChain(slot.chain ?? []);
        // Rewire the chain output → dry dest (+ optional send) EACH sync, so a pad that became an
        // instrument — or an instrument track that was created after the host — re-targets correctly.
        try { host.output.disconnect(); } catch { /* */ }
        host.output.connect(dryDest);
        if (slot.sendBus !== undefined && this.graph!.sendBuses[slot.sendBus]) {
          const send = this.ctx!.createGain();
          send.gain.value = Math.max(0, Math.min(1.5, slot.sendLevel ?? 0.5));
          host.output.connect(send);
          send.connect(this.graph!.sendBuses[slot.sendBus].input);
        }
      });
      // An instrument pad can't be per-step routed (it's one continuous voice engine), so its whole
      // output runs through the active slot's chain — an insert gated by the pad's Step-FX switch.
      if (isInstrument && instTrack) this.routeInstrumentStepFx(padIdx, pad, instTrack, dryDest);
    });
    // Drop slots that no longer exist.
    for (const [key, host] of [...this.stepFxHosts]) {
      if (!want.has(key)) { host.dispose(); this.stepFxHosts.delete(key); }
    }
  }

  /** (Re)route an instrument pad's output through its active Step-FX slot, or back to dry. Called
   *  from syncStepFx and again once the (async) instrument finishes creating. */
  private routeInstrumentStepFx(padIdx: number, pad: PadConfig, instTrack: ATrack, dryDest: AudioNode): void {
    const inst = this.instruments.get(instTrack.id);
    if (!inst) return; // not created yet — ensureInstrument re-runs syncStepFx when it lands
    const slot = pad.stepFx?.find((s) => (s.chain ?? []).some((d) => d.on));
    const on = pad.stepFxOn !== false && !!slot;
    try { inst.output.disconnect(); } catch { /* */ }
    if (on && slot) {
      const host = this.stepFxHosts.get(`${padIdx}:${slot.id}`);
      if (host) { inst.output.connect(host.input); return; }
    }
    inst.output.connect(dryDest);
  }

  /**
   * Route a pad hit to its instrument track's voice. Gated hits (sequencer / drawn notes) fire and
   * schedule their own note-off; a live hit HOLDS until release(padIdx), exactly like a sustaining
   * sample pad — so an instrument pad feels the same under a finger.
   */
  private triggerPadInstrument(pad: PadConfig, padIdx: number, vel127: number, when: number | undefined, gateSec: number | undefined, semiOffset: number): void {
    const track = this.doc.arrangement.find((t) => t.id === pad.instrumentTrackId && t.kind === 'instrument');
    if (!track || !this.ctx) return;
    const inst = this.instruments.get(track.id);
    if (!inst) { void this.ensureInstrument(track); return; } // first hit on a fresh instrument is silent; the rest aren't
    const note = Math.max(0, Math.min(127, (pad.instrumentNote ?? 60) + (pad.pitchSemis || 0) + semiOffset));
    const t = Math.max(when ?? this.ctx.currentTime, this.ctx.currentTime);
    const vel01 = Math.max(0.05, vel127 / 127);
    const kera = inst.hasKeraProgram();

    if (gateSec !== undefined) {
      const offIn = Math.max(0, (t - this.ctx.currentTime) + gateSec) * 1000;
      if (kera) {
        inst.keraNoteOn(note, vel127);
        setTimeout(() => inst.keraNoteOff(note), offIn);
      } else {
        const voiceId = inst.noteOn(note, vel01, t, this.ctx.currentTime, this.ctx.sampleRate);
        setTimeout(() => inst.noteOff(voiceId, true), offIn);
      }
      return;
    }

    // Live hit — retrigger cleanly by releasing whatever this pad was holding first.
    this.releasePadInstrument(padIdx);
    if (kera) {
      inst.keraNoteOn(note, vel127);
      this.padLiveNotes.set(padIdx, { trackId: track.id, note, voiceId: -1, kera: true });
    } else {
      const voiceId = inst.noteOn(note, vel01, t, this.ctx.currentTime, this.ctx.sampleRate);
      this.padLiveNotes.set(padIdx, { trackId: track.id, note, voiceId, kera: false });
    }
  }

  private releasePadInstrument(padIdx: number): void {
    const live = this.padLiveNotes.get(padIdx);
    if (!live) return;
    this.padLiveNotes.delete(padIdx);
    const inst = this.instruments.get(live.trackId);
    if (!inst) return;
    if (live.kera) inst.keraNoteOff(live.note);
    else inst.noteOff(live.voiceId, true);
  }

  /** Note-off for held pads (pointer up / key up / MIDI note-off). */
  release(padIdx: number, when?: number): void {
    if (this.doc.kit[padIdx]?.source === 'instrument') { this.releasePadInstrument(padIdx); return; }
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
      if (isSuiteType(track.instrument?.type) && track.instrument?.patch) {
        // VELA carries its own patch shape. Its macros expand to several engine parameters
        // each, so the expansion happens on this side rather than being sent as macro values —
        // the engine has no idea what "Air" means and should not have to.
        const { deserializeVelaPatch, velaEngineParams, velaDriftSetup } =
          await import('../../instruments/vela/patch');
        const patch = deserializeVelaPatch(track.instrument.patch);
        if (patch) {
          inst.setParams(velaDriftSetup());
          inst.setParams(velaEngineParams(patch));
        }
      } else if (track.instrument?.patch) {
        const [{ deserializePatch, applyPatch }] = await Promise.all([
          import('../../instruments/onda/patch'),
        ]);
        const patch = deserializePatch(track.instrument.patch);
        if (patch) applyPatch(inst, patch);
      }
      // Re-hydrate a saved KERA program: sample PCM comes back from the owner's OPFS/locker, zones
      // from the doc. Without this, a KERA track opened from a saved groove would be silent.
      if (track.instrument?.type === 'kera' && track.instrument.kera) {
        const prog = await deserializeKeraProgram(track.instrument.kera as unknown as SerializedKeraProgram);
        if (prog) inst.loadKeraProgram(prog);
      }
      this.instruments.set(track.id, inst);
      // If a Step-FX pad owns this instrument, route its output through the slot chain now that the
      // node exists (at connect time above it didn't, so the first sync skipped it).
      const ownerPad = this.doc.kit.findIndex((pp) => pp.instrumentTrackId === track.id);
      if (ownerPad >= 0 && (this.doc.kit[ownerPad].stepFx?.length ?? 0) > 0) this.syncStepFx();
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

  // ── Spectra EQ (mix bus) ─────────────────────────────────────────────────────
  private masterEq: SpectraEQ | null = null;

  /** The live mix-bus EQ, created + inserted on first use, seeded from the saved doc state. */
  masterEqDevice(): SpectraEQ | null {
    if (!this.ctx || !this.graph) return null;
    if (!this.masterEq) {
      this.masterEq = new SpectraEQ(this.ctx);
      this.graph.setMasterEq(this.masterEq.input, this.masterEq.output);
      const saved = this.doc.mixer.master.eq as unknown as SpectraState | undefined;
      this.masterEq.setState(saved?.bands ? saved : defaultSpectra());
    }
    return this.masterEq;
  }

  /** Push EQ state to the live device (the panel persists it to the doc separately). */
  updateMasterEq(state: SpectraState): void {
    this.masterEqDevice()?.setState(state);
  }

  /** Apply a saved EQ on doc load, if one is present and on. */
  private syncMasterEq(): void {
    const saved = this.doc.mixer.master.eq as unknown as SpectraState | undefined;
    if (saved?.on && saved.bands?.length) this.masterEqDevice()?.setState(saved);
    else if (this.masterEq) this.masterEq.setState({ on: false, mode: (saved?.mode ?? 5) as 5 | 30, bands: saved?.bands ?? [] });
  }

  // ── The Pressing (mastering chain) ──────────────────────────────────────────
  private mastering: MasteringChain | null = null;
  private loudnessNode: AudioWorkletNode | null = null;
  private loudnessSnap: LoudnessSnapshot | null = null;

  /** The live mastering insert, created + patched in on first use, seeded from the saved doc. */
  masteringDevice(): MasteringChain | null {
    if (!this.ctx || !this.graph) return null;
    if (!this.mastering) {
      this.mastering = new MasteringChain(this.ctx);
      this.graph.setMasterChain(this.mastering.input, this.mastering.output);
      const saved = this.doc.mixer.master.mastering as unknown as MasteringState | undefined;
      const state = saved && typeof saved.on === 'boolean' ? saved : defaultMastering();
      this.mastering.setState(state);
      this.graph.setGlueOn(!!state.glue && state.on);
    }
    return this.mastering;
  }

  /** Push mastering state to the live device (the Project view persists it to the doc separately). */
  updateMastering(state: MasteringState): void {
    this.masteringDevice()?.setState(state);
    this.graph?.setGlueOn(!!state.glue && state.on);
  }

  /** Apply saved mastering on doc load. Only instantiates the chain when the doc actually uses it. */
  private syncMastering(): void {
    const saved = this.doc.mixer.master.mastering as unknown as MasteringState | undefined;
    if (saved?.on) this.updateMastering(saved);
    else if (this.mastering) this.updateMastering(saved ?? defaultMastering());
  }

  // ── The unified FX Suite (master rack) ──────────────────────────────────────
  private masterSuite: FxChainHost | null = null;

  /** The live Suite host, created + inserted on first use. */
  masterSuiteDevice(): FxChainHost | null {
    if (!this.ctx || !this.graph) return null;
    if (!this.masterSuite) {
      this.masterSuite = new FxChainHost(this.ctx);
      this.graph.setMasterSuite(this.masterSuite.input, this.masterSuite.output);
    }
    return this.masterSuite;
  }

  /** Push the Suite's device list to the live rack. */
  updateMasterSuite(instances: FxInstance[]): void {
    this.masterSuiteDevice()?.setChain(instances);
  }

  /** Live gain reduction of a Suite compressor, for the rack meter. */
  suiteReduction(id: string): number { return this.masterSuite?.reductionOf(id) ?? 0; }

  /** Latest BS.1770 snapshot from the meter worklet, or null before audio has flowed. */
  loudness(): LoudnessSnapshot | null { return this.loudnessSnap; }

  /** Clear integrated/LRA/true-peak history — a fresh measurement per performance. */
  resetLoudness(): void {
    this.loudnessNode?.port.postMessage({ cmd: 'reset' });
  }

  // ── Audition — play an album track through the live pressing ────────────────
  private auditionState: { src: AudioBufferSourceNode; gain: GainNode; fx: FxChainHost | null; prior: MasteringState; id: string; startedAt: number } | null = null;

  /**
   * Play a decoded buffer straight into the master bus, optionally under a per-track pressing
   * override (the album pressing is restored when it ends or is stopped). This is how the
   * Project view's proof sheet lets you HEAR each track through its own decade.
   */
  async playAudition(id: string, buffer: AudioBuffer, pressing: MasteringState | null, trackFx?: FxInstance[]): Promise<void> {
    await this.init();
    if (!this.ctx || !this.graph) return;
    this.stopAudition();
    const prior = ((this.doc.mixer.master.mastering as unknown as MasteringState | undefined) ?? defaultMastering());
    if (pressing) this.updateMastering(pressing);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    // Per-track insert FX run BEFORE the master input, so signal is trackFX → pressing → Suite.
    let fx: FxChainHost | null = null;
    if (trackFx && trackFx.some((f) => f.on)) {
      fx = new FxChainHost(this.ctx);
      fx.setChain(trackFx);
      src.connect(gain); gain.connect(fx.input); fx.output.connect(this.graph.master.input);
    } else {
      src.connect(gain); gain.connect(this.graph.master.input);
    }
    src.onended = () => {
      if (this.auditionState?.src !== src) return;
      this.auditionState = null;
      if (pressing) this.updateMastering(prior);
      try { src.disconnect(); gain.disconnect(); fx?.dispose(); } catch { /* */ }
    };
    src.start();
    this.auditionState = { src, gain, fx, prior, id, startedAt: this.ctx.currentTime };
    this.resetLoudness(); // the meters should measure THIS track
  }

  /** Rebuild the auditioning track's FX chain live (editing a device while it plays). */
  setAuditionFx(instances: FxInstance[]): void {
    this.auditionState?.fx?.setChain(instances);
  }

  /** The live per-track FX device for an instance — so its scope can read real audio. */
  auditionFxNode(instanceId: string) { return this.auditionState?.fx?.nodeOf(instanceId); }
  /** Live gain reduction of a per-track insert device. */
  auditionFxReduction(instanceId: string): number { return this.auditionState?.fx?.reductionOf(instanceId) ?? 0; }
  /** The live Suite device for an instance — for the master rack scopes. */
  suiteNode(instanceId: string) { return this.masterSuite?.nodeOf(instanceId); }

  stopAudition(): void {
    const a = this.auditionState;
    if (!a) return;
    this.auditionState = null;
    try { a.src.onended = null; a.src.stop(); a.src.disconnect(); a.gain.disconnect(); a.fx?.dispose(); } catch { /* */ }
    this.updateMastering(a.prior);
  }

  /** The album track currently auditioning, or null. The UI polls this via the bridge. */
  auditionId(): string | null { return this.auditionState?.id ?? null; }

  /** Seconds elapsed in the current audition — the Project view's strip playhead. */
  auditionPosSec(): number {
    const a = this.auditionState;
    if (!a || !this.ctx) return 0;
    return Math.max(0, this.ctx.currentTime - a.startedAt);
  }

  /** Members of the meditation suite share VELA's patch shape and loading path. */
const isSuiteType = (t?: string): boolean =>
  t === 'vela' || t === 'cantus' || t === 'ison' || t === 'pneuma';

/** The track your keyboard plays. Exactly one, or none. */
  armedTrack(): ATrack | null {
    return this.doc.arrangement.find((t) => t.kind === 'instrument' && t.armed) ?? null;
  }

  /** Reload a track's patch into its live instrument (preset change, macro edit). */
  async reloadPatch(track: ATrack): Promise<void> {
    const inst = this.instruments.get(track.id);
    if (!inst || !track.instrument?.patch) return;
    if (isSuiteType(track.instrument.type)) {
      const { deserializeVelaPatch, velaEngineParams } = await import('../../instruments/vela/patch');
      const patch = deserializeVelaPatch(track.instrument.patch);
      if (patch) inst.setParams(velaEngineParams(patch));
      return;
    }
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
      // The arp plays through the instrument worklet, so make sure it exists — otherwise the
      // first held note before the instrument was ever touched arps into silence.
      if (!this.instruments.has(track.id)) void this.ensureInstrument(track);
      if (this.running) return; // playing: the arp owns the sound
    }
    const inst = this.instruments.get(track.id);
    if (!inst || !this.ctx) { void this.ensureInstrument(track); return; }
    // KERA (sample) instruments select zones and fire sampled voices; ONDA plays synth voices.
    if (inst.hasKeraProgram()) {
      inst.keraNoteOn(key, vel127);
      this.liveNotes.set(`${track.id}:${key}`, -1); // sentinel: KERA tracks its own voices by note
      return;
    }
    const id = inst.noteOn(key, Math.max(0.05, vel127 / 127), this.ctx.currentTime, this.ctx.currentTime, this.ctx.sampleRate);
    this.liveNotes.set(`${track.id}:${key}`, id);
  }

  /** Load a KERA program onto a track (from a dropped file / SF2). Ensures the instrument first. */
  async loadKeraProgram(track: ATrack, program: KeraProgram): Promise<void> {
    const inst = await this.ensureInstrument(track);
    inst?.loadKeraProgram(program);
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
    if (inst.hasKeraProgram()) { inst.keraNoteOff(key); this.liveNotes.delete(`${track.id}:${key}`); return; }
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
    this.stopAudition();
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
    this.stopAudition(); // the transport and an album audition never fight over the bus
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
    this.resetLoudness(); // integrated/LRA/TP measure THIS pass, not everything since page load
    this.currentPatternId = opts.patternId;
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
    this.padLiveNotes.clear();
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

  meters() { return this.graph ? this.graph.meters() : { groups: [0, 0, 0, 0], master: 0, sends: [0, 0] }; }
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
    try { this.loudnessNode?.disconnect(); } catch { /* */ }
    this.loudnessNode = null; this.loudnessSnap = null;
    this.mastering?.dispose(); this.mastering = null;
    this.masterSuite?.dispose(); this.masterSuite = null;
    this.groupInserts.forEach((h) => h?.dispose()); this.groupInserts = [null, null, null, null];
    this.sendInserts.forEach((h) => h?.dispose()); this.sendInserts = [null, null];
    this.padInserts.forEach((h) => h.dispose()); this.padInserts.clear();
    this.trackInserts.forEach((h) => h.dispose()); this.trackInserts.clear();
    this.stepFxHosts.forEach((h) => h.dispose()); this.stepFxHosts.clear();
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

    // Song-mode cycle: when the playhead reaches the loop end, jump back to the start. The
    // scheduler already stopped queuing at loopEnd, so this just restarts the window from the top.
    const loop = this.doc.loop;
    if (this.mode === 'song' && loop?.on && loop.endBeats > loop.startBeats && this.posBeats() >= loop.endBeats - 1e-6) {
      this.seekTo(loop.startBeats);
      return;
    }
    this.scheduler?.onTick(tick.t);
  }

  /** Re-anchor the transport to a beat and restart scheduling there (loop wrap / click-to-play). */
  private seekTo(beats: number): void {
    if (!this.ctx || !this.scheduler) return;
    this.anchorBeats = beats;
    this.anchorTime = this.ctx.currentTime;
    this.scheduler.start(this.mode, beats, this.currentPatternId);
    this.scheduler.onTick(this.ctx.currentTime);
  }

  /** Playhead position mapped into the loop for display — the cursor visibly jumps back. */
  posBeatsDisplay(): number {
    const loop = this.doc.loop;
    const p = this.posBeats();
    if (this.mode === 'song' && loop?.on && loop.endBeats > loop.startBeats && p >= loop.startBeats) {
      return loop.startBeats + ((p - loop.startBeats) % (loop.endBeats - loop.startBeats));
    }
    return p;
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
