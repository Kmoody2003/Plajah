// Main-thread host for the Rust DSP instruments.
//
// The WebAssembly.Module is compiled ONCE per page and shared by every instrument instance —
// compilation is the expensive part, instantiation is cheap, and each processor gets its own
// linear memory so nothing is shared across the thread boundary (hence no SharedArrayBuffer,
// hence no COEP, hence Audius playback keeps working).

import wasmUrl from './dsp/plajah_audio.wasm?url';
import workletUrl from './instrumentProcessor.worklet.js?url';

export const DSP_ABI_VERSION = 2;

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
      else if (d.type === 'error') { opts.onError?.(d.message); resolveReady(); }
    };
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
    this.post({ type: 'allNotesOff', hard });
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
