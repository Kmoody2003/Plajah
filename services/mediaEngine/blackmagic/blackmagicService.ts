// mediaEngine/blackmagic/blackmagicService.ts — the app-wide Blackmagic store. Holds the bridge connection,
// the devices it found, live ATEM/camera state, and wires two things into the media engine:
//   1. every stream a camera/phone pushes to the bridge's ingest becomes a switcher source (by itself);
//   2. an ATEM can be bound as a control surface for the switcher (surfaceSync.ts).
// React-free; `useBlackmagic` is the thin binding.

import { BridgeClient, defaultBridgeUrl, type BridgeConfig, type ClientState } from './bridgeClient';
import { SurfaceSync, type SurfaceEngine, type SurfaceMode } from './surfaceSync';
import type { AtemSnapshot, BmDevice, CameraSnapshot, IngestInfo, IngestStream, BridgeEvent } from './protocol';

export interface BlackmagicSnapshot {
  client: ClientState;
  detail?: string;
  config: BridgeConfig;
  devices: BmDevice[];
  atem: Record<string, AtemSnapshot>;
  camera: Record<string, CameraSnapshot>;
  ingest: { streams: IngestStream[]; info: IngestInfo | null };
  surface: { deviceId: string | null; mode: SurfaceMode };
  /** Ingest streams that were registered as switcher sources (stream id -> source id). */
  registered: Record<string, string>;
  ingestErrors: Record<string, string>;
}

/** What the service needs from the media engine; MediaEngine satisfies it structurally. */
export interface BlackmagicEngine extends SurfaceEngine {
  addWhepWithId(id: string, endpoint: string, label: string): Promise<{ id: string }>;
}

const CFG_KEY = 'plajah.blackmagic.bridge.v1';
const store = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function loadConfig(): BridgeConfig {
  try { const raw = store()?.getItem(CFG_KEY); if (raw) { const c = JSON.parse(raw); if (c?.url) return { url: String(c.url), token: String(c.token ?? '') }; } } catch { /* corrupt */ }
  return { url: defaultBridgeUrl(), token: '' };
}
function saveConfig(c: BridgeConfig) { try { store()?.setItem(CFG_KEY, JSON.stringify(c)); } catch { /* private mode */ } }

export class BlackmagicService {
  private client: BridgeClient | null = null;
  private listeners = new Set<() => void>();
  private engine: BlackmagicEngine | null = null;
  private surface: SurfaceSync | null = null;
  private inflight = new Set<string>();
  private snap: BlackmagicSnapshot;

  constructor(private makeClient: (c: BridgeConfig) => BridgeClient = c => new BridgeClient(c)) {
    this.snap = {
      client: 'idle', config: loadConfig(), devices: [], atem: {}, camera: {}, ingest: { streams: [], info: null },
      surface: { deviceId: null, mode: 'both' }, registered: {}, ingestErrors: {},
    };
  }

  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getSnapshot = () => this.snap;
  private set(patch: Partial<BlackmagicSnapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach(cb => cb()); }

  // ── connection ──────────────────────────────────────────────────────────────
  connect(cfg: BridgeConfig = this.snap.config) {
    this.client?.disconnect();
    saveConfig(cfg);
    this.set({ config: cfg, client: 'connecting', detail: undefined });
    const c = this.makeClient(cfg);
    this.client = c;
    c.onState((client, detail) => this.set({ client, detail }));
    c.onEvent(e => this.onEvent(e));
    c.connect();
  }
  disconnect() { this.unbindSurface(); this.client?.disconnect(); this.client = null; this.set({ client: 'idle', devices: [], atem: {}, camera: {}, ingest: { streams: [], info: null } }); }

  /** Give the service the engine whose switcher it should feed / follow. */
  attachEngine(engine: BlackmagicEngine) { this.engine = engine; void this.syncIngest(); }

  private onEvent(e: BridgeEvent) {
    switch (e.evt) {
      case 'devices': this.set({ devices: e.devices }); break;
      case 'atem':
        this.set({ atem: { ...this.snap.atem, [e.snapshot.deviceId]: e.snapshot } });
        this.surface?.onAtem(e.snapshot);
        break;
      case 'camera': this.set({ camera: { ...this.snap.camera, [e.snapshot.deviceId]: e.snapshot } }); break;
      case 'ingest': this.set({ ingest: { streams: e.streams, info: e.info } }); void this.syncIngest(); break;
      default: break;
    }
  }

  // ── cameras / phones pushing a stream: become switcher sources automatically ─
  private async syncIngest() {
    const engine = this.engine; if (!engine) return;
    for (const s of this.snap.ingest.streams) {
      if (this.snap.registered[s.id] || this.inflight.has(s.id)) continue;
      this.inflight.add(s.id);
      try {
        const src = await engine.addWhepWithId(s.id, s.whepUrl, s.label);
        const { [s.id]: _gone, ...restErr } = this.snap.ingestErrors;
        this.set({ registered: { ...this.snap.registered, [s.id]: src.id }, ingestErrors: restErr });
      } catch (err: any) {
        // Left unregistered, so the next ingest event (every few seconds while it is live) retries.
        this.set({ ingestErrors: { ...this.snap.ingestErrors, [s.id]: err?.message ?? 'Could not subscribe' } });
      } finally { this.inflight.delete(s.id); }
    }
  }

  // ── devices ─────────────────────────────────────────────────────────────────
  addDevice(host: string, kind: 'atem' | 'camera' | 'hyperdeck' = 'atem') { return this.req({ op: 'device.add', host, kind }); }
  removeDevice(id: string) { return this.req({ op: 'device.remove', id }); }

  // ── ATEM as control surface ─────────────────────────────────────────────────
  bindSurface(deviceId: string, mode: SurfaceMode = 'both', inputMap?: Record<number, string>) {
    if (!this.engine) throw new Error('No switcher attached');
    this.unbindSurface();
    const link = { send: (r: any) => this.req(r) };
    const s = new SurfaceSync(this.engine, link, { deviceId, mode, inputToDest: inputMap });
    s.start();
    this.surface = s;
    this.set({ surface: { deviceId, mode } });
    const last = this.snap.atem[deviceId];
    if (last) s.onAtem(last);
  }
  setSurfaceMode(mode: SurfaceMode) { this.surface?.setMode(mode); this.set({ surface: { ...this.snap.surface, mode } }); }
  unbindSurface() { this.surface?.stop(); this.surface = null; this.set({ surface: { deviceId: null, mode: this.snap.surface.mode } }); }

  // ── direct control (the ATEM/camera panels in the UI call these) ────────────
  atemCut(id: string) { return this.req({ op: 'atem.cut', id }); }
  atemAuto(id: string) { return this.req({ op: 'atem.auto', id }); }
  atemProgram(id: string, input: number) { return this.req({ op: 'atem.program', id, input }); }
  atemPreview(id: string, input: number) { return this.req({ op: 'atem.preview', id, input }); }
  atemMacro(id: string, index: number) { return this.req({ op: 'atem.macro', id, index }); }
  cameraRecord(id: string, on: boolean) { return this.req({ op: 'camera.record', id, on }); }

  private req(body: any) {
    if (!this.client) return Promise.reject(new Error('Bridge not connected'));
    return this.client.request(body);
  }
}

let shared: BlackmagicService | null = null;
export function getBlackmagicService(): BlackmagicService { return shared ??= new BlackmagicService(); }
export function __resetBlackmagicForTests() { shared?.disconnect(); shared = null; }
