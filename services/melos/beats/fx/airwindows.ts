// Airwindows in the insert rack — Chris Johnson's effects (MIT), run one-per-AudioWorklet. Sixteen
// are Rust ports (rust/plajah-airwindows, one shared wasm); the rest are the original C++ compiled
// to one small wasm each in public/airwindows, fetched only when first used. Both are checked
// sample-for-sample against native builds of the original C++ and share one flat ABI.
//
// Parameters stay in Airwindows' own 0..1 VST scale — that is what the DSP reads and what a
// saved project stores — and `format` prints the value the original plug-in displays, so a
// setting copied from an Airwindows video or forum post means the same thing here.
//
// Rust kind ids are the wasm ABI (rust/plajah-airwindows/src/plugins/mod.rs KINDS): append only.

import type { FxNode, FxParamSpec } from './devices';
import { AW_CATALOG } from './airwindowsCatalog.generated';

export const AIRWINDOWS_ABI_VERSION = 1;

export type AirwindowsGroup = 'saturation' | 'tape' | 'console' | 'dynamics' | 'eq' | 'space' | 'lofi';

export interface AirwindowsEffect {
  /** Rust kind id, or -1 for a compiled effect that lives in its own public/airwindows wasm. */
  kind: number;
  /** The plug-in's own name — also the device label. */
  name: string;
  group: AirwindowsGroup;
  blurb: string;
  params: FxParamSpec[];
}

/** One compiled effect, built from the generated catalog. */
export interface AirwindowsCompiled extends Omit<AirwindowsEffect, 'group'> {
  group: string;
  recommended: boolean;
  /** Measured % of one core at 48 kHz on the build laptop. */
  cpu: number;
}

const n2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const db = (lo: number, span: number) => (v: number) => `${(v * span + lo).toFixed(1)} dB`;
const P = (key: string, label: string, def: number, format: (v: number) => string = n2): FxParamSpec =>
  ({ key, label, min: 0, max: 1, default: def, step: 0.001, format });

export const AIRWINDOWS: AirwindowsEffect[] = [
  { kind: 0, name: 'Density', group: 'saturation', blurb: 'Sine-shaped thickening (or starving) with a highpass in front',
    params: [P('A', 'Density', 0.2, (v) => (v * 5 - 1).toFixed(2)), P('B', 'Highpass', 0), P('C', 'Out Level', 1), P('D', 'Dry/Wet', 1, pct)] },
  { kind: 1, name: 'PurestDrive', group: 'saturation', blurb: 'Saturation that backs off by itself on already-dense material',
    params: [P('A', 'Drive', 0)] },
  { kind: 2, name: 'Mojo', group: 'saturation', blurb: 'Loudness-style saturation that keeps the lows fat',
    params: [P('A', 'Input', 0.5, db(-12, 24))] },
  { kind: 3, name: 'Tube2', group: 'saturation', blurb: 'Tube-style asymmetric warmth with gentle overdrive',
    params: [P('A', 'Input', 0.5), P('B', 'Tube', 0.5)] },
  { kind: 4, name: 'ToTape6', group: 'tape', blurb: 'Tape machine: head bump, soften, flutter, saturation',
    params: [P('A', 'Input', 0.5, (v) => `${((v - 0.5) * 24).toFixed(1)} dB`), P('B', 'Soften', 0.5), P('C', 'Head B', 0.5), P('D', 'Flutter', 0.5),
      P('E', 'Output', 0.5, (v) => `${((v - 0.5) * 24).toFixed(1)} dB`), P('F', 'Dry/Wet', 1, pct)] },
  { kind: 5, name: 'IronOxide5', group: 'tape', blurb: 'Tape with speed controls (ips), flutter and noise',
    params: [P('A', 'Input Trim', 0.5, db(-18, 36)), P('B', 'Tape High', 0.562341325190349, (v) => `${(v ** 4 * 148.5 + 1.5).toFixed(1)} ips`),
      P('C', 'Tape Low', 0.562341325190349, (v) => `${(v ** 4 * 148.5 + 1.5).toFixed(1)} ips`), P('D', 'Flutter', 0.5), P('E', 'Noise', 0.5),
      P('F', 'Output Trim', 0.5, db(-18, 36)), P('G', 'Inv/Dry/Wet', 1, (v) => (v * 2 - 1).toFixed(2))] },
  { kind: 6, name: 'DrumSlam', group: 'dynamics', blurb: 'Drum crusher: splits the bands and slams the mids',
    params: [P('A', 'Drive', 0, (v) => (v * 3 + 1).toFixed(2)), P('B', 'Output', 1), P('C', 'Dry/Wet', 1, pct)] },
  { kind: 7, name: 'ButterComp2', group: 'dynamics', blurb: 'Smooth bipolar compressor — glue without pumping',
    params: [P('A', 'Compress', 0), P('B', 'Output', 0.5, (v) => (v * 2).toFixed(2)), P('C', 'Dry/Wet', 1, pct)] },
  { kind: 8, name: 'Pressure4', group: 'dynamics', blurb: 'Fast, characterful compressor with a "mewiness" tone control',
    params: [P('A', 'Pressure', 0), P('B', 'Speed', 0.2), P('C', 'Mewiness', 1, (v) => (v * 2 - 1).toFixed(2)), P('D', 'Output Gain', 1)] },
  { kind: 9, name: 'Console7Channel', group: 'console', blurb: 'Console channel stage — pair with Console7Buss on the bus',
    params: [P('A', 'Fader', 0.772)] },
  { kind: 10, name: 'Console7Buss', group: 'console', blurb: 'Console summing bus — the other half of Console7Channel',
    params: [P('A', 'Master', 1)] },
  { kind: 11, name: 'Baxandall2', group: 'eq', blurb: 'Broad treble/bass tone shelves, ±24 dB',
    params: [P('A', 'Treble', 0.5, db(-24, 48)), P('B', 'Bass', 0.5, db(-24, 48))] },
  { kind: 12, name: 'DeEss', group: 'eq', blurb: 'Sibilance tamer driven by slew, not a crossover',
    params: [P('A', 'Intense', 0), P('B', 'Max DS', 0.5, (v) => `${((v - 1) * 48).toFixed(1)} dB`), P('C', 'Freq', 0.5)] },
  { kind: 13, name: 'Galactic', group: 'space', blurb: 'Huge detuned ambient reverb — washes and pads',
    params: [P('A', 'Replace', 0.5), P('B', 'Brightness', 0.5), P('C', 'Detune', 0.5), P('D', 'Bigness', 1), P('E', 'Dry/Wet', 1, pct)] },
  { kind: 14, name: 'Wider', group: 'space', blurb: 'Stereo width and center control without phasey tricks',
    params: [P('A', 'Width', 0.5, (v) => (v * 2 - 1).toFixed(2)), P('B', 'Center', 0.5, (v) => (v * 2 - 1).toFixed(2)), P('C', 'Dry/Wet', 1, pct)] },
  { kind: 15, name: 'DeRez2', group: 'lofi', blurb: 'Sample-rate and bit reduction with analog-ish softening',
    params: [P('A', 'Rate', 1), P('B', 'Rez', 1), P('C', 'Hard', 1), P('D', 'Dry/Wet', 1, pct)] },
];

// Knob readouts come from the plug-in itself, not a table: a small main-thread instance of the same
// wasm answers "what would you display at this value?". Until it's loaded, the raw 0..1 value shows.
const readouts = new Map<string, { x: any }>();
const READOUT_CACHE = 32;
function keepReadout(name: string, module: WebAssembly.Module): void {
  if (readouts.has(name)) return;
  const x: any = new WebAssembly.Instance(module, {}).exports;
  x._initialize();
  x.aw_init(0, 48000, 1, 1);
  readouts.set(name, { x });
  if (readouts.size > READOUT_CACHE) readouts.delete(readouts.keys().next().value as string);
}
const cString = (x: any, p: number): string => {
  const b = new Uint8Array(x.memory.buffer);
  let e = p; while (b[e]) e++;
  return String.fromCharCode(...b.subarray(p, e)).trim();
};
const readout = (name: string, index: number) => (v: number): string => {
  const r = readouts.get(name);
  if (!r) return v.toFixed(2);
  r.x.aw_set_param(index, v);
  const shown = cString(r.x, r.x.aw_param_display(index));
  const unit = cString(r.x, r.x.aw_param_label(index));
  return unit ? `${shown} ${unit}` : shown;
};
const keyOf = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `P${i}`);

export const AIRWINDOWS_COMPILED: AirwindowsCompiled[] = AW_CATALOG.map((e) => ({
  kind: -1,
  name: e.name,
  group: e.group,
  blurb: e.blurb,
  recommended: e.rec,
  cpu: e.cpu,
  params: e.params.map(([label, def], i) => P(keyOf(i), label, def, readout(e.name, i))),
}));

/** Device `type` in an FxInstance: stable string per effect. */
export const airwindowsType = (e: Pick<AirwindowsEffect, 'name'>) => `aw.${e.name.toLowerCase()}`;

const modules = new Map<string, Promise<WebAssembly.Module>>();
const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

function getModule(effect: Pick<AirwindowsEffect, 'kind' | 'name'>): Promise<WebAssembly.Module> {
  const key = effect.kind >= 0 ? '' : effect.name;
  let p = modules.get(key);
  if (!p) {
    const url = effect.kind >= 0
      ? new URL('../engine/dsp/plajah_airwindows.wasm', import.meta.url).href
      : `/airwindows/${effect.name}.wasm`;
    p = fetch(`${url}?abi=${AIRWINDOWS_ABI_VERSION}`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`Airwindows fetch failed: ${r.status}`); return r.arrayBuffer(); })
      .then((bytes) => WebAssembly.compile(bytes));
    modules.set(key, p);
    p.catch(() => { modules.delete(key); });
  }
  return p;
}

function ensureWorklet(ctx: BaseAudioContext): Promise<void> {
  let p = workletLoaded.get(ctx);
  if (!p) { p = ctx.audioWorklet.addModule(new URL('../engine/airwindows.worklet.js', import.meta.url).href); workletLoaded.set(ctx, p); }
  return p;
}

const pendingByCtx = new WeakMap<BaseAudioContext, Set<Promise<void>>>();

/**
 * Resolves once every Airwindows insert created on `ctx` so far is in its signal path. Every
 * offline render calls this right before startRendering() — the devices come up async, and a
 * bounce that starts first prints those inserts dry.
 */
export async function airwindowsSettled(ctx: BaseAudioContext): Promise<void> {
  const set = pendingByCtx.get(ctx);
  if (set?.size) await Promise.all([...set]);
}

const seed = () => ((Math.random() * 0xffffffff) | 0x10000) >>> 0;

/**
 * One Airwindows insert. `create` is synchronous (the FxDescriptor contract), so the node is a
 * pass-through until the worklet is up — usually a frame or two live. An offline render must
 * await `ready()` (FxChainHost.ready) before startRendering, or the bounce prints it dry.
 */
export class AirwindowsNode implements FxNode {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly pre: AnalyserNode;
  readonly post: AnalyserNode;
  private node: AudioWorkletNode | null = null;
  private values: number[];
  private disposed = false;
  private readonly readyPromise: Promise<void>;

  /** `seeds` pins the dither/flutter xorshift (labs compare against the bare wasm); omit in the app. */
  constructor(ctx: BaseAudioContext, private readonly effect: Pick<AirwindowsEffect, 'kind' | 'name' | 'params'>, private readonly seeds?: { l: number; r: number }) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.pre = ctx.createAnalyser(); this.pre.fftSize = 2048; this.pre.smoothingTimeConstant = 0.7;
    this.post = ctx.createAnalyser(); this.post.fftSize = 2048; this.post.smoothingTimeConstant = 0.7;
    this.input.connect(this.pre);
    this.output.connect(this.post);
    this.input.connect(this.output); // pass-through until the worklet answers
    this.values = effect.params.map((p) => p.default);
    this.readyPromise = this.start(ctx).catch((err) => {
      console.warn(`[airwindows] ${effect.name} unavailable, passing audio through:`, err);
    });
    let set = pendingByCtx.get(ctx);
    if (!set) { set = new Set(); pendingByCtx.set(ctx, set); }
    const pending = this.readyPromise;
    set.add(pending);
    void pending.then(() => set.delete(pending));
  }

  private async start(ctx: BaseAudioContext): Promise<void> {
    const [module] = await Promise.all([getModule(this.effect), ensureWorklet(ctx)]);
    if (this.disposed) return;
    if (this.effect.kind < 0) keepReadout(this.effect.name, module);
    const node = new AudioWorkletNode(ctx, 'plajah-airwindows', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit', // mono sources up-mix to both channels, as a stereo insert expects
      channelInterpretation: 'speakers',
      outputChannelCount: [2],
      processorOptions: { module, abi: AIRWINDOWS_ABI_VERSION, kind: this.effect.kind, seedL: this.seeds?.l ?? seed(), seedR: this.seeds?.r ?? seed(), params: this.values },
    });
    await new Promise<void>((resolve, reject) => {
      node.port.onmessage = (e) => {
        if (e.data?.type === 'ready') resolve();
        else if (e.data?.type === 'error') reject(new Error(e.data.message));
      };
    });
    if (this.disposed) { node.disconnect(); return; }
    node.port.postMessage({ type: 'params', values: this.values }); // anything set while loading
    this.input.disconnect(this.output);
    this.input.connect(node);
    node.connect(this.output);
    this.node = node;
  }

  /** Resolves once the effect is actually in the signal path (or has failed to pass-through). */
  ready(): Promise<void> { return this.readyPromise; }

  setParams(p: Record<string, number>): void {
    this.values = this.effect.params.map((spec) => {
      const v = p[spec.key];
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : spec.default;
    });
    this.node?.port.postMessage({ type: 'params', values: this.values });
  }

  dispose(): void {
    this.disposed = true;
    for (const n of [this.input, this.output, this.pre, this.post, this.node]) { try { n?.disconnect(); } catch { /* */ } }
    this.node = null;
  }
}
