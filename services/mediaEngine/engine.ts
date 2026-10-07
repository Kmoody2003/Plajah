// mediaEngine/engine.ts — the authoritative Media Engine store.
//
// Holds the router, switcher and sync state and owns the source lifecycle. The React
// console is a control surface over this state (per the spec: authoritative state lives
// engine-side). In the browser it drives real WebRTC/webcam sources; a native build
// would back the same API with the Rust/GStreamer engine.

import {
  Capabilities, RouterState, SwitcherState, SyncEngine, VideoSource, Destination,
  Salvo, TransitionType, MasterClock, DEFAULT_HOUSE_FORMAT, SourceHealth, SourceKind,
} from './types';
import { detectCapabilities } from './capabilities';
import { WebcamSource, WhepSource, ExternalStreamSource } from './browserSources';
import {
  hasNativeEngine, listNativeSources, scanNdiStreams, scanNetworkFeeds, connectNativeSource, disconnectNativeSource,
  nativeRoute, nativeProgram, nativeSync, nativeTransition, nativeOutput, NativeSourceInfo,
} from './bridge';
import { VideoSource as IVideoSource, FrameRef, PROGRAM_SOURCE_ID } from './types';
import { ProgramOutput } from './programOutput';
import { ProgramRecorder } from './programRecorder';
// Publishers pull in Firebase + rtcCore — loaded only when someone actually goes live.
import type { PlajahLiveOptions } from './programPublisher';

/** A source acquired by the native engine (capture card / NDI / SRT). Frames arrive as
 *  GPU texture handles, not a browser MediaStream. No-op unless a native host is present. */
export class NativeSource implements IVideoSource {
  id: string; label: string; kind: NativeSourceInfo['kind'];
  formats: NativeSourceInfo['formats']; latencyMs: number; clockDomain?: string;
  url?: string; machineName?: string; streamName?: string; status?: string; discoveryMethod?: string;
  tally: IVideoSource['tally'] = 'off'; stream = null; connected = false;
  private cbs: ((f: FrameRef) => void)[] = [];
  constructor(info: NativeSourceInfo) {
    this.id = info.id; this.label = info.label; this.kind = info.kind;
    this.formats = info.formats || []; this.latencyMs = info.latencyMs ?? 0; this.clockDomain = info.clockDomain;
    this.url = info.url; this.machineName = info.machineName; this.streamName = info.streamName;
    this.status = info.status; this.discoveryMethod = info.discoveryMethod;
  }
  async connect() { const r = await connectNativeSource(this.id); this.connected = !!r; if (r?.textureId) for (const cb of this.cbs) cb({ textureId: r.textureId }); }
  onFrame(cb: (f: FrameRef) => void) { this.cbs.push(cb); }
  dispose() { disconnectNativeSource(this.id); this.connected = false; this.cbs = []; }
}

export type AutoDirectorMode = 'off' | 'assist' | 'auto';

export interface OutputsState {
  /** The browser program compositor is running (program monitor / record / live use it). */
  programActive: boolean;
  recording: { active: boolean; startedAt?: number; via?: 'browser' | 'native'; error?: string };
  /** The last finished recording, ready to download or save. */
  lastRecording?: { blob: Blob; durationSec: number; at: number };
  live: {
    active: boolean; starting?: boolean; kind?: 'plajah' | 'whip';
    streamId?: string; watchUrl?: string; startedAt?: number; error?: string;
  };
}

export interface DirectorStatus { mode: AutoDirectorMode; reason?: string; heldUntil?: number }

export type LiveTarget =
  | ({ kind: 'plajah' } & PlajahLiveOptions)
  | { kind: 'whip'; url: string; bearer?: string };

export interface EngineState {
  caps: Capabilities;
  router: RouterState;
  switcher: SwitcherState;
  sync: SyncEngine;
  outputs: OutputsState;
  director: DirectorStatus;
}

const DEFAULT_DESTS: Destination[] = [
  { id: 'sw1', label: 'SW 1', kind: 'switcherInput' },
  { id: 'sw2', label: 'SW 2', kind: 'switcherInput' },
  { id: 'sw3', label: 'SW 3', kind: 'switcherInput' },
  { id: 'sw4', label: 'SW 4', kind: 'switcherInput' },
  { id: 'aux', label: 'AUX', kind: 'aux' },
  { id: 'stream', label: 'STREAM', kind: 'stream' },
  { id: 'record', label: 'RECORD', kind: 'record' },
];

let counter = 0;
const uid = (p: string) => `${p}_${(counter++).toString(36)}_${Math.floor(performance.now())}`;

export class MediaEngine {
  private state: EngineState;
  private listeners = new Set<(s: EngineState) => void>();

  constructor() {
    const caps = detectCapabilities();
    this.state = {
      caps,
      // STREAM and RECORD carry the composited program by default; route a source to them for an ISO.
      router: { sources: [], destinations: DEFAULT_DESTS, routes: { stream: PROGRAM_SOURCE_ID, record: PROGRAM_SOURCE_ID }, salvos: [], locks: {} },
      switcher: {
        inputs: ['sw1', 'sw2', 'sw3', 'sw4'],
        program: 'sw1', preview: 'sw2',
        transition: { type: 'mix', rateFrames: 15, position: 0 },
        usk: [], dsk: [], aux: {},
      },
      sync: {
        masterClock: caps.hardwareGenlock ? 'hw-ref' : 'soft',
        syncTargetMs: 800,
        houseFormat: DEFAULT_HOUSE_FORMAT,
        perSource: {},
      },
      outputs: { programActive: false, recording: { active: false }, live: { active: false } },
      director: { mode: 'off' },
    };
  }

  getState(): EngineState { return this.state; }

  subscribe(cb: (s: EngineState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private commit(next: Partial<EngineState>) {
    this.state = { ...this.state, ...next };
    this.syncProgramOutput();
    for (const cb of this.listeners) cb(this.state);
  }

  // ── Program output (compositor + AFV audio) ───────────────────────────────────
  private program: ProgramOutput | null = null;
  private recorder = new ProgramRecorder();
  private liveStop: (() => Promise<void>) | null = null;

  /** Start the browser program compositor. Idempotent. The console calls this on mount so the
   *  program monitor shows real composited pixels; record/live start it on demand too. */
  enableProgramOutput(): ProgramOutput {
    if (!this.program) {
      const { width, height } = this.state.sync.houseFormat;
      // 1080p59.94 house format composites at 1080p30 in the browser — canvas capture above
      // 30 fps costs more than it shows. Native hosts composite at the real house rate.
      this.program = new ProgramOutput({ width: Math.min(width, 1920), height: Math.min(height, 1080), fps: 30 });
      this.program.start();
      this.commit({ outputs: { ...this.state.outputs, programActive: true } });
    }
    return this.program;
  }

  get programOutput(): ProgramOutput | null { return this.program; }

  private syncProgramOutput() {
    if (!this.program) return;
    const { router, switcher } = this.state;
    const ref = (destId: string) => {
      const src = router.sources.find(s => s.id === router.routes[destId]);
      return src ? { id: src.id, stream: src.stream ?? null } : null;
    };
    this.program.update({
      program: ref(switcher.program),
      preview: ref(switcher.preview),
      transition: { type: switcher.transition.type, position: switcher.transition.position },
      sources: router.sources.map(s => ({ id: s.id, stream: s.stream ?? null })),
    });
  }

  /** What a destination carries: the composited program, or a raw source (an ISO). */
  outputStreamFor(destId: string): MediaStream | null {
    const routed = this.state.router.routes[destId];
    if (!routed || routed === PROGRAM_SOURCE_ID) return this.enableProgramOutput().stream;
    return this.sourceById(routed)?.stream ?? null;
  }

  private setOutputs(patch: Partial<OutputsState>) { this.commit({ outputs: { ...this.state.outputs, ...patch } }); }

  async startRecording(): Promise<void> {
    if (this.state.outputs.recording.active) return;
    // A native host records the real program (ProRes/MXF) — prefer it, fall back to the browser.
    if (hasNativeEngine()) {
      const r = await nativeOutput('start', { id: 'record', kind: 'record', source: this.state.router.routes.record || PROGRAM_SOURCE_ID });
      if (r.success) { this.setOutputs({ recording: { active: true, startedAt: Date.now(), via: 'native' } }); return; }
    }
    const stream = this.outputStreamFor('record');
    if (!stream) { this.setOutputs({ recording: { active: false, error: 'Nothing is routed to RECORD.' } }); return; }
    try {
      this.program?.audio.resume();
      this.recorder.start(stream);
      this.setOutputs({ recording: { active: true, startedAt: Date.now(), via: 'browser' } });
    } catch (e: any) {
      this.setOutputs({ recording: { active: false, error: e?.message || 'Recording failed to start.' } });
    }
  }

  async stopRecording(): Promise<Blob | null> {
    const rec = this.state.outputs.recording;
    if (!rec.active) return null;
    if (rec.via === 'native') {
      await nativeOutput('stop', { id: 'record', kind: 'record' });
      this.setOutputs({ recording: { active: false } });
      return null;
    }
    const durationSec = this.recorder.durationSec;
    const blob = await this.recorder.stop();
    this.setOutputs({
      recording: { active: false },
      ...(blob ? { lastRecording: { blob, durationSec, at: Date.now() } } : {}),
    });
    return blob;
  }

  clearLastRecording() { this.setOutputs({ lastRecording: undefined }); }

  /** Put the STREAM destination on air. */
  async goLive(target: LiveTarget): Promise<void> {
    if (this.state.outputs.live.active || this.state.outputs.live.starting) return;
    const stream = this.outputStreamFor('stream');
    if (!stream) { this.setOutputs({ live: { active: false, error: 'Nothing is routed to STREAM.' } }); return; }
    this.program?.audio.resume();
    this.setOutputs({ live: { active: false, starting: true } });
    try {
      const { goLiveOnPlajah, publishWhip } = await import('./programPublisher');
      if (target.kind === 'plajah') {
        const h = await goLiveOnPlajah(stream, target);
        this.liveStop = h.stop;
        this.setOutputs({ live: { active: true, kind: 'plajah', streamId: h.streamId, watchUrl: h.watchUrl, startedAt: Date.now() } });
      } else {
        const h = await publishWhip(stream, target.url, {
          bearer: target.bearer,
          onStateChange: s => { if (s === 'failed') this.setOutputs({ live: { ...this.state.outputs.live, error: 'WHIP connection lost' } }); },
        });
        this.liveStop = h.stop;
        this.setOutputs({ live: { active: true, kind: 'whip', startedAt: Date.now() } });
      }
    } catch (e: any) {
      this.setOutputs({ live: { active: false, error: e?.message || 'Could not go live.' } });
    }
  }

  async endLive(): Promise<void> {
    const stop = this.liveStop;
    this.liveStop = null;
    await stop?.().catch(() => {});
    this.setOutputs({ live: { active: false } });
  }

  // ── Auto-director status (the AutoDirector writes; the console reads) ──────────
  setDirectorStatus(patch: Partial<DirectorStatus>) { this.commit({ director: { ...this.state.director, ...patch } }); }

  private recomputeSync() {
    const { sync, router } = this.state;
    const perSource: SyncEngine['perSource'] = {};
    for (const s of router.sources) {
      const lat = s.latencyMs || 0;
      const health: SourceHealth = lat > sync.syncTargetMs ? 'starved' : lat > sync.syncTargetMs * 0.75 ? 'jitter' : 'ok';
      perSource[s.id] = { measuredLatencyMs: lat, offsetMs: Math.max(0, sync.syncTargetMs - lat), health };
    }
    this.commit({ sync: { ...sync, perSource } });
  }

  // ── Sources ────────────────────────────────────────────────────────────────
  private addSource(src: VideoSource) {
    this.commit({ router: { ...this.state.router, sources: [...this.state.router.sources, src] } });
    this.recomputeSync();
  }

  /** Connect a browser source, then register it. A failed connect (permission denied,
   *  WHEP 4xx) never leaves a dead source in the router. */
  private async connectAndAdd(src: VideoSource): Promise<VideoSource> {
    try {
      await src.connect();
    } catch (e) {
      src.dispose();
      throw e;
    }
    this.addSource(src);
    this.autoRoute(src.id);
    return src;
  }

  async addWebcam(deviceId?: string, label?: string): Promise<VideoSource> {
    return this.connectAndAdd(new WebcamSource(uid('cam'), label || `Camera ${this.state.router.sources.length + 1}`, deviceId));
  }

  async addWhep(endpoint: string, label?: string): Promise<VideoSource> {
    return this.connectAndAdd(new WhepSource(uid('whep'), label || 'Remote Guest', endpoint));
  }

  /** Add (or refresh) a stream that arrived from elsewhere — e.g. a Sports Director phone over
   *  rtcCore. Same id again = the same input reconnecting: its stream is swapped in place, so
   *  routes, tally and program survive the reconnect. Grows the switcher if it's full. */
  addStreamSource(id: string, label: string, stream: MediaStream, kind: SourceKind = 'webrtc'): VideoSource {
    const existing = this.sourceById(id);
    if (existing instanceof ExternalStreamSource) {
      existing.setStream(stream);
      existing.label = label;
      this.commit({ router: { ...this.state.router } });
      return existing;
    }
    const src = new ExternalStreamSource(id, label, stream, kind);
    this.addSource(src);
    if (!this.state.switcher.inputs.some(d => !this.state.router.routes[d])) this.ensureSwitcherInputs(this.state.switcher.inputs.length + 1);
    this.autoRoute(src.id);
    return src;
  }

  /** Make sure the switcher has at least `n` inputs (SW 1…SW n), up to 16. */
  ensureSwitcherInputs(n: number) {
    const target = Math.min(16, n);
    const { router, switcher } = this.state;
    if (switcher.inputs.length >= target) return;
    const inputs = [...switcher.inputs];
    const added: Destination[] = [];
    for (let i = inputs.length + 1; i <= target; i++) {
      inputs.push(`sw${i}`);
      added.push({ id: `sw${i}`, label: `SW ${i}`, kind: 'switcherInput' });
    }
    const firstNonInput = router.destinations.findIndex(d => d.kind !== 'switcherInput');
    const at = firstNonInput < 0 ? router.destinations.length : firstNonInput;
    const destinations = [...router.destinations.slice(0, at), ...added, ...router.destinations.slice(at)];
    this.commit({ router: { ...router, destinations }, switcher: { ...switcher, inputs } });
  }

  /** The switcher input a source is routed to (first match), if any. */
  inputForSource(srcId: string): string | undefined {
    const { router, switcher } = this.state;
    return switcher.inputs.find(d => router.routes[d] === srcId);
  }

  /** Put a new source on the first empty, unlocked switcher input so it shows up on the bus. */
  private autoRoute(srcId: string) {
    const { router, switcher } = this.state;
    const free = switcher.inputs.find(d => !router.routes[d] && !router.locks[d]);
    if (free) this.route(free, srcId);
  }

  /** Pull real native inputs (capture cards / NDI / SRT) from the native host, if any. */
  async refreshNativeSources(): Promise<void> {
    if (!hasNativeEngine()) return;
    const infos = await listNativeSources();
    const existing = new Set(this.state.router.sources.map(s => s.id));
    const fresh = infos.filter(i => !existing.has(i.id)).map(i => new NativeSource(i));
    if (fresh.length) {
      this.commit({ router: { ...this.state.router, sources: [...this.state.router.sources, ...fresh] } });
      this.recomputeSync();
    }
  }

  /** Actively probe the network and NDI runtime for NDI streams and register them into the router/switcher. */
  async scanNdi(): Promise<NativeSourceInfo[]> {
    if (!hasNativeEngine()) return [];
    return this.registerFound(await scanNdiStreams());
  }

  /** NDI senders and OMT senders in one scan — everything announcing itself on the network. */
  async scanNetworkFeeds(): Promise<NativeSourceInfo[]> {
    if (!hasNativeEngine()) return [];
    return this.registerFound(await scanNetworkFeeds());
  }

  private registerFound(infos: NativeSourceInfo[]): NativeSourceInfo[] {
    const existing = new Set(this.state.router.sources.map(s => s.id));
    const fresh = infos.filter(i => !existing.has(i.id)).map(i => new NativeSource(i));
    if (fresh.length) {
      this.commit({ router: { ...this.state.router, sources: [...this.state.router.sources, ...fresh] } });
      this.recomputeSync();
      fresh.forEach(s => this.autoRoute(s.id));
    }
    return infos;
  }

  removeSource(id: string) {
    const src = this.state.router.sources.find(s => s.id === id);
    src?.dispose();
    const routes = { ...this.state.router.routes };
    for (const d of Object.keys(routes)) if (routes[d] === id) delete routes[d];
    this.commit({ router: { ...this.state.router, sources: this.state.router.sources.filter(s => s.id !== id), routes } });
    this.recomputeSync();
    this.updateTally();
  }

  sourceById(id: string): VideoSource | undefined { return this.state.router.sources.find(s => s.id === id); }

  // ── Router ─────────────────────────────────────────────────────────────────
  route(destId: string, srcId: string) {
    if (this.state.router.locks[destId]) return; // destination locked
    this.commit({ router: { ...this.state.router, routes: { ...this.state.router.routes, [destId]: srcId } } });
    this.updateTally();
    nativeRoute(destId, srcId); // mirror to the native graph (no-op in browser)
  }

  toggleLock(destId: string) {
    const locks = { ...this.state.router.locks, [destId]: !this.state.router.locks[destId] };
    this.commit({ router: { ...this.state.router, locks } });
  }

  saveSalvo(name: string) {
    const salvo: Salvo = { id: uid('salvo'), name, routes: { ...this.state.router.routes } };
    this.commit({ router: { ...this.state.router, salvos: [...this.state.router.salvos, salvo] } });
  }

  recallSalvo(id: string) {
    const salvo = this.state.router.salvos.find(s => s.id === id);
    if (!salvo) return;
    // Respect destination locks on recall, and skip sources removed since the salvo was saved.
    const live = new Set(this.state.router.sources.map(s => s.id));
    const routes = { ...this.state.router.routes };
    for (const [dest, src] of Object.entries(salvo.routes)) {
      if (!this.state.router.locks[dest] && (live.has(src) || src === PROGRAM_SOURCE_ID)) routes[dest] = src;
    }
    this.commit({ router: { ...this.state.router, routes } });
    this.updateTally();
  }

  // ── Switcher ───────────────────────────────────────────────────────────────
  // Who made the last program change. The auto-director acts through `asDirector` so an
  // operator's own TAKE/CUT can be told apart — that's how a human override is detected.
  private actor: 'operator' | 'director' = 'operator';
  lastTake: { at: number; by: 'operator' | 'director' } | null = null;
  asDirector<T>(fn: () => T): T {
    const prev = this.actor;
    this.actor = 'director';
    try { return fn(); } finally { this.actor = prev; }
  }
  private stampTake() { this.lastTake = { at: Date.now(), by: this.actor }; }

  setProgram(destId: string) { this.stampTake(); this.commit({ switcher: { ...this.state.switcher, program: destId } }); this.updateTally(); }
  setPreview(destId: string) { this.commit({ switcher: { ...this.state.switcher, preview: destId } }); this.updateTally(); }
  setTransition(type: TransitionType) {
    this.commit({ switcher: { ...this.state.switcher, transition: { ...this.state.switcher.transition, type } } });
    this.mirrorTransition(true);
  }
  setTransitionRate(frames: number) {
    const rateFrames = Math.max(1, Math.min(300, Math.round(frames)));
    this.commit({ switcher: { ...this.state.switcher, transition: { ...this.state.switcher.transition, rateFrames } } });
    this.mirrorTransition(true);
  }

  /** Mirror the transition to the native compositor — always on type/rate/idle changes,
   *  throttled to ~30 Hz while the bar moves (IPC per 60 Hz tick is wasted work). */
  private lastMirror = 0;
  private mirrorTransition(force = false) {
    const now = performance.now();
    if (!force && now - this.lastMirror < 33) return;
    this.lastMirror = now;
    const { type, rateFrames, position } = this.state.switcher.transition;
    nativeTransition(type, rateFrames, position);
  }

  get inTransition(): boolean { return this.state.switcher.transition.position > 0; }

  /** CUT — swap PGM/PVW instantly, abandoning any transition in progress. */
  cut() {
    this.stopAuto();
    this.stampTake();
    const { program, preview, transition } = this.state.switcher;
    this.commit({ switcher: { ...this.state.switcher, program: preview, preview: program, transition: { ...transition, position: 0 } } });
    this.updateTally();
    this.mirrorTransition(true);
  }

  /** AUTO — run the selected transition over `rateFrames` at the house frame rate, from
   *  wherever the T-bar currently sits. A CUT transition type just cuts. */
  auto() {
    const { transition } = this.state.switcher;
    if (transition.type === 'cut') { this.cut(); return; }
    if (this.autoTimer) return; // already running
    const fps = this.state.sync.houseFormat.fps || 59.94;
    const durationMs = (transition.rateFrames / fps) * 1000;
    const from = transition.position;
    const start = performance.now();
    const by = this.actor; // the timer callbacks run outside asDirector — carry the actor along
    // Timer-driven and clock-derived (not rAF): rAF stops in a hidden/minimised window, which
    // would freeze a transition half-way with both sources on air. A throttled timer still
    // lands the transition on time because position comes from elapsed wall-clock.
    const step = () => {
      const p = Math.min(1, from + ((performance.now() - start) / durationMs) * (1 - from));
      if (p >= 1) {
        this.autoTimer = 0;
        if (by === 'director') this.asDirector(() => this.completeTransition()); else this.completeTransition();
        return;
      }
      this.setPosition(p);
      this.autoTimer = window.setTimeout(step, 1000 / 60);
    };
    this.autoTimer = window.setTimeout(step, 0);
  }

  /** TAKE — the switcher's main button: runs the selected transition (CUT type = instant). */
  take() { this.auto(); }

  /** T-bar — manual transition position 0..1. Reaching the end completes the transition. */
  setTransitionPosition(p: number) {
    this.stopAuto();
    const pos = Math.max(0, Math.min(1, p));
    if (pos >= 1) { this.completeTransition(); return; }
    this.setPosition(pos);
  }

  private autoTimer = 0;
  private stopAuto() { if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = 0; } }

  private setPosition(position: number) {
    const wasIdle = this.state.switcher.transition.position === 0;
    this.commit({ switcher: { ...this.state.switcher, transition: { ...this.state.switcher.transition, position } } });
    if (wasIdle !== (position === 0)) this.updateTally(); // preview joins program tally mid-transition
    this.mirrorTransition(wasIdle !== (position === 0));
  }

  private completeTransition() {
    this.stampTake();
    const { program, preview, transition } = this.state.switcher;
    this.commit({ switcher: { ...this.state.switcher, program: preview, preview: program, transition: { ...transition, position: 0 } } });
    this.updateTally();
    this.mirrorTransition(true);
  }

  // ── Sync ───────────────────────────────────────────────────────────────────
  setMasterClock(clock: MasterClock) { this.commit({ sync: { ...this.state.sync, masterClock: clock } }); nativeSync(clock, this.state.sync.syncTargetMs); }
  setSyncTarget(ms: number) { this.commit({ sync: { ...this.state.sync, syncTargetMs: ms } }); this.recomputeSync(); nativeSync(this.state.sync.masterClock, ms); }

  // ── Tally ──────────────────────────────────────────────────────────────────
  /** A source feeding the PGM-bound switcher input inherits program tally; PVW → preview.
   *  Mid-transition both sources are on air, so the incoming one also goes program. */
  private updateTally() {
    const { switcher, router } = this.state;
    const pgmSrc = router.routes[switcher.program];
    const pvwSrc = router.routes[switcher.preview];
    const mixing = switcher.transition.position > 0;
    for (const s of router.sources) {
      s.tally = s.id === pgmSrc || (mixing && s.id === pvwSrc) ? 'program' : s.id === pvwSrc ? 'preview' : 'off';
    }
    this.commit({ router: { ...router } });
    nativeProgram(switcher.program, switcher.preview); // mirror PGM/PVW + tally to native
  }

  dispose() {
    this.stopAuto();
    this.recorder.stop().catch(() => {});
    this.liveStop?.().catch(() => {});
    this.liveStop = null;
    this.program?.dispose();
    this.program = null;
    this.state.router.sources.forEach(s => s.dispose());
    this.listeners.clear();
  }
}
