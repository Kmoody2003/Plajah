// Main-thread host for the Rust DSP instruments.
//
// The WebAssembly.Module is compiled ONCE per page and shared by every instrument instance —
// compilation is the expensive part, instantiation is cheap, and each processor gets its own
// linear memory so nothing is shared across the thread boundary (hence no SharedArrayBuffer,
// hence no COEP, hence Audius playback keeps working).

import wasmUrl from './dsp/plajah_audio.wasm?url';
import workletUrl from './instrumentProcessor.worklet.js?url';
import { selectZones, type KeraProgram } from '../../instruments/kera/zones';
import { DEEP_VARIANTS, deepVelBucket, lookupDeep, requestDeep, somaDeepSupported, somaParamsKey, type DeepHit } from '../../instruments/soma/deep/somaDeep';
import { modCapture } from '../modulators';
import type { NativeTrack } from './nativeStream';

/** Envelope seconds → the engine's normalised 0..1 (inverse of env_time in params.rs: 0.001 + 12·n³). */
function secToNorm(sec: number): number {
  const n = Math.cbrt(Math.max(0, sec - 0.001) / 12);
  return Math.max(0, Math.min(1, n));
}

/** 11 adds AURA (param block 1700+): 1960s & 1970s analogue synthesis circuitry. Bumping this
 *  is what stops a stale committed .wasm from loading against a host that expects the new parameters. */
export const DSP_ABI_VERSION = 16; // 16: SOMA deep skin (GPU modes, note_on_deep); 15: LYRA brass, strings, plucked, guitar rig; 14: LYRA physical models (block 1900+); 13: scheduled KERA notes

/** Output layouts — must mirror `spatial::Layout` in the Rust crate. */
export enum SpatialLayout {
  Stereo = 0,
  Quad = 1,
  Surround51 = 2,
  Surround714 = 3,
  AmbisonicFoa = 4,
}

/** Mirrors `IAMFMetadata.groupType` in components/spatialMixer/types.ts. */
export enum IamfRole {
  Scene = 0,
  Object = 1,
}

export interface SpatialState {
  position: [number, number, number];
  layout: SpatialLayout;
  role: IamfRole;
}

let modulePromise: Promise<WebAssembly.Module> | null = null;
const workletLoaded = new WeakSet<BaseAudioContext>();

/** The compiled DSP core, shared (also used on the main thread for SOMA deep-skin excitation). */
export async function getModule(): Promise<WebAssembly.Module> {
  if (!modulePromise) {
    const bustUrl = `${wasmUrl}${wasmUrl.includes('?') ? '&' : '?'}abi=${DSP_ABI_VERSION}`;
    modulePromise = fetch(bustUrl, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`DSP core fetch failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => WebAssembly.compile(bytes));
  }
  return modulePromise;
}

async function ensureWorklet(ctx: BaseAudioContext): Promise<void> {
  if (workletLoaded.has(ctx)) return;
  await (ctx as AudioContext).audioWorklet.addModule(workletUrl);
  workletLoaded.add(ctx);
}

/** Rewrites a key before it sounds: the engine note, velocity and parameters for this one note. */
export type NoteMapper = (key: number, velocity01: number, modWheel: number, live: boolean) =>
  { note: number; velocity: number; params: Array<[number, number]> } | null;

export interface InstrumentOptions {
  channels?: number;
  onError?: (message: string) => void;
}

/**
 * One instrument instance. Owns an AudioWorkletNode; connect its `output` into the existing
 * Beats graph (`graph.padDestination()` / `graph.trackDestination()`) — the bus architecture
 * does not change.
 */
export class Instrument {
  readonly node: AudioWorkletNode;
  /** The track this plays, so a touched control can be traced back to it (modulators.ts). */
  trackId = '';
  readonly analyser: AnalyserNode | null = null;
  private readonly outGain: GainNode | null = null;
  private disposed = false;
  private nextVoiceId = 1;
  private heldVoices = new Map<number, number>(); // note → voiceId
  activeVoices = 0;
  lastNote = 60;
  lastVelocity = 0;
  lastNoteOnPerf = 0;
  modWheelValue = 0;
  pitchBendValue = 0;

  private readyPromise: Promise<void>;

  private constructor(ctx: BaseAudioContext, node: AudioWorkletNode, opts: InstrumentOptions) {
    this.node = node;
    try {
      if (typeof ctx.createGain === 'function' && typeof ctx.createAnalyser === 'function') {
        const g = ctx.createGain();
        g.gain.value = 1;
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.15;
        node.connect(g);
        node.connect(an);
        this.outGain = g;
        this.analyser = an;
      }
    } catch {
      // Fallback to direct node connection in headless/offline environments
    }
    let resolveReady: () => void = () => {};
    this.readyPromise = new Promise<void>((res) => { resolveReady = res; });
    node.port.onmessage = (e) => {
      const d = e.data;
      if (!d) return;
      if (d.type === 'voices') this.activeVoices = d.count;
      else if (d.type === 'ready') resolveReady();
      else if (d.type === 'pong') { const r = this.pendingPings.get(d.id); if (r) { this.pendingPings.delete(d.id); r(); } }
      else if (d.type === 'error') { opts.onError?.(d.message); resolveReady(); }
    };
  }

  private pingId = 0;
  private pendingPings = new Map<number, () => void>();

  /**
   * Resolve once the worklet has drained every message posted before this call. Messages are
   * processed in order, so the returned pong proves the wavetable/sample uploads (and their
   * synchronous mip-pyramid build) are fully committed. The offline render awaits this before
   * startRendering() — without it, a bounce can read a table that hasn't been built yet and go
   * silent, even though live playback (which has real time between load and note) is fine.
   */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const id = ++this.pingId;
    return new Promise<void>((resolve) => {
      this.pendingPings.set(id, resolve);
      this.post({ type: 'ping', id });
      // Safety valve: a dropped message must never hang a render.
      setTimeout(() => { if (this.pendingPings.delete(id)) resolve(); }, 750);
    });
  }

  static async create(ctx: BaseAudioContext, opts: InstrumentOptions = {}): Promise<Instrument> {
    const [module] = await Promise.all([getModule(), ensureWorklet(ctx)]);
    const node = new AudioWorkletNode(ctx, 'plajah-instrument', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [opts.channels ?? 2],
      processorOptions: { module, abi: DSP_ABI_VERSION },
    });
    return new Instrument(ctx, node, opts);
  }

  get output(): AudioNode {
    return this.outGain ?? this.node;
  }

  /**
   * Read the live time-domain audio waveform from the instrument's AnalyserNode tap.
   * Returns the peak absolute amplitude (0..1+) in the buffer.
   */
  readWaveform(dest: Float32Array): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(dest as Float32Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < dest.length; i++) {
      const a = Math.abs(dest[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  /** Returns currently held MIDI note numbers on this instrument. */
  heldNoteNumbers(): number[] {
    return Array.from(this.heldVoices.keys());
  }

  /**
   * Start a note. `when` is an absolute AudioContext time; it becomes a sample offset inside the
   * render block, so an asynchronous message still yields a sample-accurate onset.
   */
  /** Times are optional: without them the note plays now (an audition key, not a scheduled note). */
  /** `raw` skips the note mapper (a strike that already set exactly where it lands, e.g. a click on SOMA's drumhead). */
  noteOn(key: number, velocity: number, ctxTime = 0, currentTime = 0, sampleRate = 48000, raw = false): number {
    const voiceId = this.nextVoiceId++;
    const off = Math.round((ctxTime - currentTime) * sampleRate);
    const frameOffset = Number.isFinite(off) ? Math.max(0, off) : 0;
    const { note, velocity01 } = raw ? { note: key, velocity01: velocity } : this.mapNote(key, velocity, ctxTime > 0 ? Math.round(ctxTime * sampleRate) : 0, ctxTime === 0);
    this.lastNote = note;
    this.lastVelocity = velocity01;
    this.lastNoteOnPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const deep = this.somaDeep(note, velocity01);
    if (deep) this.post({ type: 'noteOnDeep', note, velocity: velocity01, voiceId, frameOffset, ...deep });
    else this.post({ type: 'noteOn', note, velocity: velocity01, voiceId, frameOffset });
    this.heldVoices.set(key, voiceId);
    return voiceId;
  }

  // ── Note mapping ──────────────────────────────────────────────────────────────
  // An instrument can rewrite each key before it sounds — SOMA's hand map turns a key or pad into a
  // stroke at a place on the drum. The mapper's per-note parameters ride a frame-timed message, so
  // they land on exactly this note whether it's live, scheduled ahead or in an offline bounce.

  private noteMapper: NoteMapper | null = null;
  setNoteMapper(m: NoteMapper | null): void { if (m) this.detachNative(); this.noteMapper = m; }

  private mapNote(key: number, velocity: number, frame: number, live: boolean): { note: number; velocity01: number } {
    const m = this.noteMapper?.(key, velocity, this.modWheelValue, live);
    if (!m) return { note: key, velocity01: velocity };
    if (m.params.length) {
      for (const [id, v] of m.params) this.params.set(id, v);
      this.paramsKeyMemo = null;
      this.post({ type: 'paramsAt', frame, ids: Int32Array.from(m.params.map((e) => e[0])), values: Float32Array.from(m.params.map((e) => e[1])) });
    }
    return { note: m.note, velocity01: m.velocity };
  }

  // ── SOMA deep skin (ABI 16) ──────────────────────────────────────────────────
  // A SOMA strike whose GPU-rendered upper membrane is cached plays it inside the voice
  // (somaDeep.ts); otherwise it plays as before and the layer is rendered for next time.

  private params = new Map<number, number>();
  private paramsKeyMemo: string | null = null;
  private deepSlots = new Map<DeepHit, number>(); // LRU: insertion order = age
  private deepTick = 0;

  private isSoma(): boolean {
    return (this.params.get(1800) ?? 0) > 0.5 && !this.keraProgram;
  }

  private somaKey(): string {
    return (this.paramsKeyMemo ??= somaParamsKey(this.params));
  }

  private get sampleRate(): number {
    return this.node.context.sampleRate;
  }

  /** Slot, level and cloud floor for a deep strike, or null to play it on the CPU cloud. */
  private somaDeep(note: number, velocity01: number): { slot: number; gain: number; top: number } | null {
    if (!this.isSoma() || !somaDeepSupported()) return null;
    const key = this.somaKey();
    const variant = this.deepTick++ % DEEP_VARIANTS;
    let hit: DeepHit | undefined;
    for (let i = 0; i < DEEP_VARIANTS && !hit; i++) hit = lookupDeep(key, note, velocity01, (variant + i) % DEEP_VARIANTS, this.sampleRate);
    if (!hit) {
      void requestDeep(this.params, key, note, this.sampleRate, getModule);
      return null;
    }
    const v = Math.max(0.02, Math.min(1, velocity01));
    return { slot: this.deepSlot(hit), gain: v / deepVelBucket(v), top: hit.topRatio };
  }

  /** The engine sample slot holding `hit`, uploading it (and evicting the oldest) if needed. */
  private deepSlot(hit: DeepHit): number {
    const have = this.deepSlots.get(hit);
    if (have !== undefined) {
      this.deepSlots.delete(hit);
      this.deepSlots.set(hit, have);
      return have;
    }
    let slot = this.deepSlots.size;
    if (slot >= 128) {
      const [oldHit, oldSlot] = this.deepSlots.entries().next().value as [DeepHit, number];
      this.deepSlots.delete(oldHit);
      slot = oldSlot;
    }
    this.deepSlots.set(hit, slot);
    const data = hit.data.slice();
    this.node.port.postMessage({
      type: 'loadSample', slot, data, frames: hit.frames, channels: 2,
      sampleRate: this.sampleRate, rootNote: 60, loopStart: 0, loopEnd: 0, loopMode: 0,
    }, [data.buffer]);
    return slot;
  }

  /** Render the deep layers for these notes now (an offline bounce awaits this before scheduling). */
  async warmSomaDeep(notes: number[]): Promise<void> {
    if (!this.isSoma() || !somaDeepSupported()) return;
    const key = this.somaKey();
    await Promise.all([...new Set(notes)].map((n) => requestDeep(this.params, key, n, this.sampleRate, getModule)));
  }

  /** Gate a scheduled voice at `ctxTime`. A native voice is stamped now, since its frames render ahead of the clock. */
  noteOffAt(voiceId: number, ctxTime: number): void {
    if (this.native?.owns(voiceId)) { this.native.offAt(voiceId, ctxTime); return; }
    setTimeout(() => this.noteOff(voiceId, true), Math.max(0, ctxTime - this.node.context.currentTime) * 1000);
  }

  // ── Native engine (Windows app, nativeStream.ts) ─────────────────────────────
  // While attached, sequenced notes render on the native engine and stream back into this
  // instrument's output, so meters, FX and mixer see them as usual. Live notes stay in the worklet.

  private native: NativeTrack | null = null;

  attachNative(track: NativeTrack): void {
    this.native = track;
    track.connect(this.outGain ?? this.node.context.destination, this.analyser, () => { this.native = null; });
    for (const [id, value] of this.params) track.mirror({ type: 'param', id, value });
  }

  /** The native side has no samples or wavetables: an instrument that needs them plays in the worklet. */
  private detachNative(): void {
    this.native?.dispose();
    this.native = null;
  }

  noteOff(noteOrVoiceId: number, byVoiceId = false): void {
    const voiceId = byVoiceId ? noteOrVoiceId : this.heldVoices.get(noteOrVoiceId);
    if (voiceId === undefined) return;
    if (!byVoiceId) {
      this.heldVoices.delete(noteOrVoiceId);
    } else {
      for (const [k, v] of this.heldVoices.entries()) {
        if (v === voiceId) {
          this.heldVoices.delete(k);
          break;
        }
      }
    }
    this.post({ type: 'noteOff', voiceId });
  }

  allNotesOff(hard = false): void {
    this.heldVoices.clear();
    this.keraHeld.clear();
    this.post({ type: 'allNotesOff', hard });
  }

  // ── KERA sample playback (ABI v3) ────────────────────────────────────────────

  private keraProgram: KeraProgram | null = null;
  private keraSlotOf = new Map<string, number>(); // KeraSample.id → engine slot
  private keraRr = new Map<number, number>();       // round-robin counters
  private keraHeld = new Map<number, number[]>();    // note → voiceIds (velocity layers)

  /** Upload a KERA program's samples into engine slots. Idempotent per program id. */
  loadKeraProgram(program: KeraProgram): void {
    this.detachNative();
    this.keraProgram = program;
    this.keraSlotOf.clear();
    this.keraRr.clear();
    let slot = 0;
    for (const s of program.samples) {
      if (slot >= 128) break; // engine slot cap
      this.keraSlotOf.set(s.id, slot);
      // Interleave channel-major for the engine.
      const frames = s.channels[0]?.length ?? 0;
      const chCount = s.channels.length;
      const data = new Float32Array(frames * chCount);
      for (let c = 0; c < chCount; c++) data.set(s.channels[c], c * frames);
      this.node.port.postMessage({
        type: 'loadSample', slot, data, frames, channels: chCount,
        sampleRate: s.sampleRate, rootNote: s.rootNote,
        loopStart: Math.max(0, s.loopStart), loopEnd: Math.max(0, s.loopEnd),
        loopMode: s.loopMode === 'forward' ? 1 : s.loopMode === 'sustain' ? 2 : 0,
      }, [data.buffer]);
      slot += 1;
    }
    // The program's amp envelope maps onto the shared engine envelope (slot 0).
    const a = program.amp;
    this.setParams([
      [700 + 0, secToNorm(a.attack)],
      [700 + 1, secToNorm(a.decay)],
      [700 + 2, a.sustain],
      [700 + 3, secToNorm(a.release)],
    ]);
  }

  /** The engine voices a note fires through the loaded KERA program: zones selected (velocity
   *  layers, round-robins), each zone's tuning + its sample's fine-tune folded into detune cents
   *  (the engine resamples from the sample's root itself), and the zone + program level folded
   *  into the voice velocity (the engine scales amplitude by it; attenuation only, never > 1). */
  private keraVoices(note: number, velocity127: number): { velocity: number; voices: Array<{ voiceId: number; slot: number; detune: number; startFrame: number }> } {
    const prog = this.keraProgram;
    if (!prog) return { velocity: 0, voices: [] };
    const zones = selectZones(prog, note, velocity127, this.keraRr);
    const sampleById = new Map(prog.samples.map((s) => [s.id, s]));
    const voices: Array<{ voiceId: number; slot: number; detune: number; startFrame: number }> = [];
    let gainDb = -Infinity;
    for (const z of zones) {
      const slot = this.keraSlotOf.get(z.sampleId);
      if (slot === undefined) continue;
      const detune = z.tuneSemis * 100 + z.tuneCents + prog.transpose * 100 + (sampleById.get(z.sampleId)?.fineTune ?? 0);
      voices.push({ voiceId: this.nextVoiceId++, slot, detune, startFrame: 0 });
      gainDb = Math.max(gainDb, z.gainDb);
    }
    const level = Math.min(1, Math.pow(10, ((Number.isFinite(gainDb) ? gainDb : 0) + (prog.gainDb || 0)) / 20));
    // voice.rs scales amplitude by (0.25 + 0.75·vel); solve for the vel that lands `level` lower.
    const vel = Math.max(0.05, velocity127 / 127);
    return { velocity: Math.max(0, ((0.25 + 0.75 * vel) * level - 0.25) / 0.75), voices };
  }

  /** Play a note through the loaded KERA program — one sampled voice per matching zone. */
  keraNoteOn(note: number, velocity127: number): void {
    const { velocity, voices } = this.keraVoices(note, velocity127);
    if (!voices.length) return;
    this.keraHeld.set(note, voices.map((v) => v.voiceId));
    this.post({ type: 'noteOnSampled', note, velocity, frameOffset: 0, voices });
  }

  /** The offline twin of keraNoteOn: zones are chosen now (round-robins advance in note order),
   *  voices fire at absolute frames on the engine's own clock. Returns the voice ids so the caller
   *  can schedule their note-offs. */
  keraScheduleNote(note: number, velocity127: number, onFrame: number, offFrame: number): number {
    const { velocity, voices } = this.keraVoices(note, velocity127);
    for (const v of voices) {
      this.post({ type: 'scheduleOnSampled', note, velocity, voiceId: v.voiceId, frame: onFrame, slot: v.slot, detune: v.detune, startFrame: v.startFrame });
      this.post({ type: 'scheduleOff', voiceId: v.voiceId, frame: offFrame });
    }
    return voices.length;
  }

  keraNoteOff(note: number): void {
    const ids = this.keraHeld.get(note);
    if (!ids) return;
    this.keraHeld.delete(note);
    for (const id of ids) this.post({ type: 'noteOff', voiceId: id });
  }

  hasKeraProgram(): boolean {
    return !!this.keraProgram;
  }

  /**
   * Queue a note at an absolute sample position. This is the OFFLINE path: an
   * OfflineAudioContext renders faster than messages are delivered, so every note has to be
   * posted before `startRendering()` and fired by the engine's own frame counter.
   * Returns the voice id so the caller can schedule the matching note-off.
   */
  scheduleNoteOn(key: number, velocity: number, frame: number): number {
    const voiceId = this.nextVoiceId++;
    const { note, velocity01 } = this.mapNote(key, velocity, frame, false);
    const deep = this.somaDeep(note, velocity01);
    if (deep) this.post({ type: 'scheduleOnDeep', note, velocity: velocity01, voiceId, frame, ...deep });
    else this.post({ type: 'scheduleOn', note, velocity: velocity01, voiceId, frame });
    return voiceId;
  }

  scheduleNoteOff(voiceId: number, frame: number): void {
    this.post({ type: 'scheduleOff', voiceId, frame });
  }

  clearSchedule(): void {
    this.post({ type: 'clearSchedule' });
  }

  /** Rewind the engine's sample clock — call once before an offline render. */
  resetTransport(frame = 0): void {
    this.post({ type: 'resetTransport', frame });
  }

  /** Resolves once the processor has instantiated, so an offline render can post safely. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Frame-stamped parameter writes: land inside the block at `frame`, live or in a bounce. */
  paramsAt(frame: number, entries: Array<[number, number]>): void {
    if (!entries.length) return;
    this.post({ type: 'paramsAt', frame, ids: Int32Array.from(entries.map((e) => e[0])), values: Float32Array.from(entries.map((e) => e[1])) });
  }

  /** A modulator's write: reaches the engine but leaves the stored sound alone, so the patch keeps
   *  its base value (and SOMA's per-sound cache isn't invalidated by a moving knob). */
  modParam(id: number, value: number): void {
    this.post({ type: 'param', id, value });
  }

  private captureWrite(id: number, value: number): void {
    if (modCapture.active) modCapture.writes.push({ trackId: this.trackId, id, before: this.params.get(id) ?? value, after: value });
  }

  setParam(id: number, value: number): void {
    this.captureWrite(id, value);
    this.params.set(id, value);
    this.paramsKeyMemo = null;
    this.post({ type: 'param', id, value });
  }

  /** Bulk apply — one message instead of hundreds when loading a preset. */
  setParams(entries: Array<[number, number]>): void {
    if (!entries.length) return;
    for (const [id, v] of entries) {
      if (modCapture.active && this.params.get(id) !== v) this.captureWrite(id, v);
      this.params.set(id, v);
    }
    this.paramsKeyMemo = null;
    this.post({
      type: 'params',
      ids: Int32Array.from(entries.map((e) => e[0])),
      values: Float32Array.from(entries.map((e) => e[1])),
    });
  }

  setMacro(index: number, value: number): void {
    if (modCapture.active) modCapture.messages.push({ trackId: this.trackId, target: { kind: 'macro', index } });
    this.post({ type: 'macro', index, value });
  }

  setRoute(index: number, source: number, dest: number, depth: number, via = 0): void {
    this.post({ type: 'route', index, source, dest, depth, via });
  }

  /** MPE per-note expression. Wired from day one so MPE is additive, not a rewrite. */
  setExpression(voiceId: number, bend: number, pressure: number, timbre: number): void {
    this.post({ type: 'expression', voiceId, bend, pressure, timbre });
  }

  setModWheel(v: number): void {
    if (modCapture.active) modCapture.messages.push({ trackId: this.trackId, target: { kind: 'mod-wheel' } });
    this.modWheelValue = Math.max(0, Math.min(1, v));
    this.post({ type: 'modWheel', value: this.modWheelValue });
  }
  setPitchBend(v: number): void {
    if (modCapture.active) modCapture.messages.push({ trackId: this.trackId, target: { kind: 'pitch-bend' } });
    this.pitchBendValue = Math.max(-1, Math.min(1, v));
    this.post({ type: 'pitchBend', value: this.pitchBendValue });
  }
  setTempo(beatsPerSec: number): void {
    this.post({ type: 'tempo', beatsPerSec });
  }

  /** Spatial state — position is the source of truth; stereo is just one rendering of it. */
  setSpatial(s: Partial<SpatialState>): void {
    if (s.position) this.post({ type: 'position', x: s.position[0], y: s.position[1], z: s.position[2] });
    if (s.layout !== undefined) this.post({ type: 'layout', layout: s.layout });
    if (s.role !== undefined) this.post({ type: 'iamfRole', role: s.role });
  }

  /** Upload a wavetable: `data` is `frames * frameSize` samples; frameSize must be a power of 2. */
  loadWavetable(slot: number, data: Float32Array, frames: number, frameSize: number): void {
    this.detachNative();
    // Transfer a copy so the caller keeps ownership of its bank.
    const copy = new Float32Array(data);
    this.node.port.postMessage({ type: 'wavetable', slot, data: copy, frames, frameSize }, [copy.buffer]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.post({ type: 'dispose' });
    this.detachNative();
    try { this.node.disconnect(); } catch { /* already detached */ }
    try { this.outGain?.disconnect(); } catch { /* already detached */ }
    try { this.analyser?.disconnect(); } catch { /* already detached */ }
    this.node.port.onmessage = null;
  }

  private post(msg: Record<string, unknown>): void {
    if (this.disposed) return;
    if (this.native?.mirror(msg)) return;
    this.node.port.postMessage(msg);
  }
}
