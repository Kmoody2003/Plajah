// mediaEngine/engine.ts — the authoritative Media Engine store.
//
// Holds the router, switcher and sync state and owns the source lifecycle. The React
// console is a control surface over this state (per the spec: authoritative state lives
// engine-side). In the browser it drives real WebRTC/webcam sources; a native build
// would back the same API with the Rust/GStreamer engine.

import {
  Capabilities, RouterState, SwitcherState, SyncEngine, VideoSource, Destination,
  Salvo, TransitionType, MasterClock, DEFAULT_HOUSE_FORMAT, SourceHealth,
} from './types';
import { detectCapabilities } from './capabilities';
import { WebcamSource, WhepSource } from './browserSources';
import {
  hasNativeEngine, listNativeSources, connectNativeSource, disconnectNativeSource,
  nativeRoute, nativeProgram, nativeSync, NativeSourceInfo,
} from './bridge';
import { VideoSource as IVideoSource, FrameRef } from './types';

/** A source acquired by the native engine (capture card / NDI / SRT). Frames arrive as
 *  GPU texture handles, not a browser MediaStream. No-op unless a native host is present. */
class NativeSource implements IVideoSource {
  id: string; label: string; kind: NativeSourceInfo['kind'];
  formats: NativeSourceInfo['formats']; latencyMs: number; clockDomain?: string;
  tally: IVideoSource['tally'] = 'off'; stream = null; connected = false;
  private cbs: ((f: FrameRef) => void)[] = [];
  constructor(info: NativeSourceInfo) {
    this.id = info.id; this.label = info.label; this.kind = info.kind;
    this.formats = info.formats || []; this.latencyMs = info.latencyMs ?? 0; this.clockDomain = info.clockDomain;
  }
  async connect() { const r = await connectNativeSource(this.id); this.connected = !!r; if (r?.textureId) for (const cb of this.cbs) cb({ textureId: r.textureId }); }
  onFrame(cb: (f: FrameRef) => void) { this.cbs.push(cb); }
  dispose() { disconnectNativeSource(this.id); this.connected = false; this.cbs = []; }
}

export interface EngineState {
  caps: Capabilities;
  router: RouterState;
  switcher: SwitcherState;
  sync: SyncEngine;
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
      router: { sources: [], destinations: DEFAULT_DESTS, routes: {}, salvos: [], locks: {} },
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
    };
  }

  getState(): EngineState { return this.state; }

  subscribe(cb: (s: EngineState) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private commit(next: Partial<EngineState>) {
    this.state = { ...this.state, ...next };
    for (const cb of this.listeners) cb(this.state);
  }

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

  async addWebcam(deviceId?: string, label?: string): Promise<VideoSource> {
    const src = new WebcamSource(uid('cam'), label || `Camera ${this.state.router.sources.length + 1}`, deviceId);
    this.addSource(src);
    await src.connect();
    this.commit({ router: { ...this.state.router } }); // re-emit after connect
    return src;
  }

  async addWhep(endpoint: string, label?: string): Promise<VideoSource> {
    const src = new WhepSource(uid('whep'), label || 'Remote Guest', endpoint);
    this.addSource(src);
    await src.connect();
    this.commit({ router: { ...this.state.router } });
    return src;
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

  removeSource(id: string) {
    const src = this.state.router.sources.find(s => s.id === id);
    src?.dispose();
    const routes = { ...this.state.router.routes };
    for (const d of Object.keys(routes)) if (routes[d] === id) delete routes[d];
    this.commit({ router: { ...this.state.router, sources: this.state.router.sources.filter(s => s.id !== id), routes } });
    this.recomputeSync();
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
    // Respect destination locks on recall.
    const routes = { ...this.state.router.routes };
    for (const [dest, src] of Object.entries(salvo.routes)) if (!this.state.router.locks[dest]) routes[dest] = src;
    this.commit({ router: { ...this.state.router, routes } });
    this.updateTally();
  }

  // ── Switcher ───────────────────────────────────────────────────────────────
  setProgram(destId: string) { this.commit({ switcher: { ...this.state.switcher, program: destId } }); this.updateTally(); }
  setPreview(destId: string) { this.commit({ switcher: { ...this.state.switcher, preview: destId } }); this.updateTally(); }
  setTransition(type: TransitionType) { this.commit({ switcher: { ...this.state.switcher, transition: { ...this.state.switcher.transition, type } } }); }

  /** TAKE — swap PGM/PVW (a cut, or the start of the selected transition). */
  take() {
    const { program, preview } = this.state.switcher;
    this.commit({ switcher: { ...this.state.switcher, program: preview, preview: program } });
    this.updateTally();
  }

  // ── Sync ───────────────────────────────────────────────────────────────────
  setMasterClock(clock: MasterClock) { this.commit({ sync: { ...this.state.sync, masterClock: clock } }); nativeSync(clock, this.state.sync.syncTargetMs); }
  setSyncTarget(ms: number) { this.commit({ sync: { ...this.state.sync, syncTargetMs: ms } }); this.recomputeSync(); nativeSync(this.state.sync.masterClock, ms); }

  // ── Tally ──────────────────────────────────────────────────────────────────
  /** A source feeding the PGM-bound switcher input inherits program tally; PVW → preview. */
  private updateTally() {
    const { switcher, router } = this.state;
    const pgmSrc = router.routes[switcher.program];
    const pvwSrc = router.routes[switcher.preview];
    for (const s of router.sources) {
      s.tally = s.id === pgmSrc ? 'program' : s.id === pvwSrc ? 'preview' : 'off';
    }
    this.commit({ router: { ...router } });
    nativeProgram(switcher.program, switcher.preview); // mirror PGM/PVW + tally to native
  }

  dispose() {
    this.state.router.sources.forEach(s => s.dispose());
    this.listeners.clear();
  }
}
