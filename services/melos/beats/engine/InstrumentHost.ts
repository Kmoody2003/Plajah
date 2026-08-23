// Main-thread host for the Rust DSP instruments.
//
// The WebAssembly.Module is compiled ONCE per page and shared by every instrument instance —
// compilation is the expensive part, instantiation is cheap, and each processor gets its own
// linear memory so nothing is shared across the thread boundary (hence no SharedArrayBuffer,
// hence no COEP, hence Audius playback keeps working).

import wasmUrl from './dsp/plajah_audio.wasm?url';
import workletUrl from './instrumentProcessor.worklet.js?url';
import { selectZones, type KeraProgram } from '../../instruments/kera/zones';

/** Envelope seconds → the engine's normalised 0..1 (inverse of env_time in params.rs: 0.001 + 12·n³). */
function secToNorm(sec: number): number {
  const n = Math.cbrt(Math.max(0, sec - 0.001) / 12);
  return Math.max(0, Math.min(1, n));
}

/** 5 adds VELA: the modal body, the exciter and the Veil (param block 1000+), the Tide LFO
 *  shape and the slow LFO range. Bumping this is what stops a stale committed .wasm from
 *  loading against a host that expects the new parameters. */
export const DSP_ABI_VERSION = 9;

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

async function getModule(): Promise<WebAssembly.Module> {
  if (!modulePromise) {
    modulePromise = fetch(wasmUrl)
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
  private disposed = false;
  private nextVoiceId = 1;
  private heldVoices = new Map<number, number>(); // note → voiceId
  activeVoices = 0;

  private readyPromise: Promise<void>;

  private constructor(node: AudioWorkletNode, opts: InstrumentOptions) {
    this.node = node;
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
    return new Instrument(node, opts);
  }

  get output(): AudioNode {
    return this.node;
  }

  /**
   * Start a note. `when` is an absolute AudioContext time; it becomes a sample offset inside the
   * render block, so an asynchronous message still yields a sample-accurate onset.
   */
  noteOn(note: number, velocity01: number, ctxTime: number, currentTime: number, sampleRate: number): number {
    const voiceId = this.nextVoiceId++;
    const frameOffset = Math.max(0, Math.round((ctxTime - currentTime) * sampleRate));
    this.post({ type: 'noteOn', note, velocity: velocity01, voiceId, frameOffset });
    this.heldVoices.set(note, voiceId);
    return voiceId;
  }

  noteOff(noteOrVoiceId: number, byVoiceId = false): void {
    const voiceId = byVoiceId ? noteOrVoiceId : this.heldVoices.get(noteOrVoiceId);
    if (voiceId === undefined) return;
    if (!byVoiceId) this.heldVoices.delete(noteOrVoiceId);
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

  /** Play a note through the loaded KERA program — selects zones (velocity layers, round-robins)
   *  and fires one sampled voice per matching zone. */
  keraNoteOn(note: number, velocity127: number): void {
    if (!this.keraProgram) return;
    const zones = selectZones(this.keraProgram, note, velocity127, this.keraRr);
    if (!zones.length) return;
    const voices: Array<{ voiceId: number; slot: number; detune: number; startFrame: number }> = [];
    for (const z of zones) {
      const slot = this.keraSlotOf.get(z.sampleId);
      if (slot === undefined) continue;
      // Fold zone semis into detune cents so the engine's root-relative resample stays one path.
      const detune = z.tuneSemis * 100 + z.tuneCents + this.keraProgram.transpose * 100;
      voices.push({ voiceId: this.nextVoiceId++, slot, detune, startFrame: 0 });
    }
    if (!voices.length) return;
    this.keraHeld.set(note, voices.map((v) => v.voiceId));
    this.post({ type: 'noteOnSampled', note, velocity: Math.max(0.05, velocity127 / 127), frameOffset: 0, voices });
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
  scheduleNoteOn(note: number, velocity01: number, frame: number): number {
    const voiceId = this.nextVoiceId++;
    this.post({ type: 'scheduleOn', note, velocity: velocity01, voiceId, frame });
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

  setParam(id: number, value: number): void {
    this.post({ type: 'param', id, value });
  }

  /** Bulk apply — one message instead of hundreds when loading a preset. */
  setParams(entries: Array<[number, number]>): void {
    if (!entries.length) return;
    this.post({
      type: 'params',
      ids: Int32Array.from(entries.map((e) => e[0])),
      values: Float32Array.from(entries.map((e) => e[1])),
    });
  }

  setMacro(index: number, value: number): void {
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
    this.post({ type: 'modWheel', value: v });
  }
  setPitchBend(v: number): void {
    this.post({ type: 'pitchBend', value: v });
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
    // Transfer a copy so the caller keeps ownership of its bank.
    const copy = new Float32Array(data);
    this.node.port.postMessage({ type: 'wavetable', slot, data: copy, frames, frameSize }, [copy.buffer]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.post({ type: 'dispose' });
    try { this.node.disconnect(); } catch { /* already detached */ }
    this.node.port.onmessage = null;
  }

  private post(msg: Record<string, unknown>): void {
    if (this.disposed) return;
    this.node.port.postMessage(msg);
  }
}
