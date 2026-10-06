// mediaEngine/sourceDiscovery.ts — continuous, React-free source discovery for NDI, OMT and SRT.
//
// NDI senders (NDI runtime finder) and OMT senders (DNS-SD _omt._tcp) are genuinely announced, so they
// are polled on a backoff interval while the app is visible and diffed into added / removed / changed /
// online / offline events with stable ids. Missing from a scan is not "gone": a source is marked offline
// after `offlineAfterMisses` consecutive misses and only dropped after `dropAfterMs` offline.
//
// SRT has NO announcement protocol, so nothing here pretends to "find" SRT senders. The honest
// equivalents (remembered endpoints, auto-reconnect, auto-listen, last-used-host probing) live in
// SrtSupervisor below, and every SRT source is labelled by origin. If the native host cannot move SRT
// packets (no libsrt) the status says so and no source is shown as live.

import {
  getNdiStatus, getSrtStats, getSrtTransportStatus, connectSrtCaller, startSrtListener, stopSrtStream,
  hasNativeEngine, scanNdiStreams, scanOmtStreams,
  type NativeSourceInfo, type NdiStatus, type SrtTransportStatus,
} from './bridge';

export type DiscoveryProtocol = 'ndi' | 'omt' | 'srt';
export type ProtocolState = 'ok' | 'not-installed' | 'finder-off' | 'unsupported' | 'transport-missing' | 'error' | 'unknown';
export interface ProtocolStatus { state: ProtocolState; detail?: string; checkedAt: number }
export type SourceOrigin = 'announced' | 'remembered' | 'auto-listen' | 'probed';

export interface DiscoveredSource extends NativeSourceInfo {
  protocol: DiscoveryProtocol;
  online: boolean;
  origin: SourceOrigin;
  firstSeen: number;
  lastSeen: number;
  misses: number;
}

export type DiscoveryEvent =
  | { type: 'added' | 'removed' | 'changed' | 'online' | 'offline'; source: DiscoveredSource }
  | { type: 'status'; protocol: DiscoveryProtocol; status: ProtocolStatus };

export interface DiscoverySnapshot {
  sources: DiscoveredSource[];
  status: Record<DiscoveryProtocol, ProtocolStatus>;
  scanning: boolean;
  lastScanAt: number | null;
}

// ── Injectables (so tests run with a fake clock and a fake bridge) ───────────
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface DiscoveryBridge {
  hasNative(): boolean;
  scanNdi(): Promise<NativeSourceInfo[]>;
  scanOmt(): Promise<NativeSourceInfo[]>;
  ndiStatus(): Promise<NdiStatus | null>;
  srtTransport(): Promise<SrtTransportStatus | null>;
  srtListen(a: { streamId: string; name: string; port: number; latencyMs?: number }): Promise<any>;
  srtCall(a: { streamId: string; name: string; host: string; port: number; latencyMs?: number }): Promise<any>;
  srtStop(streamId: string): Promise<boolean>;
  srtStats(streamId: string): Promise<any>;
}
export const realBridge: DiscoveryBridge = {
  hasNative: hasNativeEngine,
  scanNdi: async () => (await scanNdiStreams()).filter(s => s.kind === 'ndi'),
  scanOmt: scanOmtStreams,
  ndiStatus: getNdiStatus,
  srtTransport: getSrtTransportStatus,
  srtListen: startSrtListener,
  srtCall: connectSrtCaller,
  srtStop: stopSrtStream,
  srtStats: getSrtStats,
};
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: h => clearTimeout(h as any),
};

export interface DiscoveryOptions {
  bridge?: DiscoveryBridge;
  clock?: Clock;
  storage?: StorageLike | null;
  baseIntervalMs?: number;        // fastest poll (a scan just changed something)
  maxIntervalMs?: number;         // slowest poll (steady network)
  offlineAfterMisses?: number;    // consecutive missed scans before a source is marked offline
  dropAfterMs?: number;           // an offline source is forgotten after this long
  isVisible?: () => boolean;
  /** Called once with a callback to invoke when visibility changes; returns an unsubscribe. */
  watchVisibility?: (cb: () => void) => () => void;
}

const fingerprint = (s: NativeSourceInfo) =>
  JSON.stringify([s.label, s.url, s.status, s.machineName, s.streamName, s.formats]);

/** Stable id: the host's own id, else derived from protocol + machine/stream (never from list position). */
export function stableSourceId(protocol: DiscoveryProtocol, s: NativeSourceInfo): string {
  if (s.id) return s.id;
  const key = [s.machineName, s.streamName].filter(Boolean).join('/') || s.url || s.label || 'unknown';
  return `${protocol}:${key.replace(/\s+/g, '_')}`;
}

export function mapNdiStatus(st: NdiStatus | null, hasNative: boolean, now: number): ProtocolStatus {
  if (!hasNative) return { state: 'unsupported', detail: 'NDI discovery needs the desktop or native app; a browser cannot see NDI senders.', checkedAt: now };
  if (!st) return { state: 'unknown', detail: 'The native host did not report NDI status.', checkedAt: now };
  if (!st.installed) return { state: 'not-installed', detail: st.diagnosis || 'NDI runtime is not installed.', checkedAt: now };
  if (!st.finderRunning) return { state: 'finder-off', detail: st.diagnosis || st.lastError || 'NDI finder is not running.', checkedAt: now };
  return { state: 'ok', detail: st.diagnosis, checkedAt: now };
}

export class SourceDiscovery {
  private readonly bridge: DiscoveryBridge;
  private readonly clock: Clock;
  private readonly o: Required<Pick<DiscoveryOptions, 'baseIntervalMs' | 'maxIntervalMs' | 'offlineAfterMisses' | 'dropAfterMs'>>;
  private readonly isVisible: () => boolean;
  private readonly watchVisibility?: (cb: () => void) => () => void;

  private known = new Map<string, DiscoveredSource & { fp: string }>();
  private snapshot: DiscoverySnapshot;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: DiscoveryEvent) => void>();
  private timer: unknown = null;
  private unwatch: (() => void) | null = null;
  private running = false;
  private interval: number;
  private inflight: Promise<void> | null = null;
  readonly srt: SrtSupervisor;

  constructor(opts: DiscoveryOptions = {}) {
    this.bridge = opts.bridge ?? realBridge;
    this.clock = opts.clock ?? realClock;
    this.o = {
      baseIntervalMs: opts.baseIntervalMs ?? 4000,
      maxIntervalMs: opts.maxIntervalMs ?? 30000,
      offlineAfterMisses: opts.offlineAfterMisses ?? 3,
      dropAfterMs: opts.dropAfterMs ?? 10 * 60_000,
    };
    this.isVisible = opts.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
    this.watchVisibility = opts.watchVisibility ?? (typeof document !== 'undefined'
      ? cb => { document.addEventListener('visibilitychange', cb); return () => document.removeEventListener('visibilitychange', cb); }
      : undefined);
    this.interval = this.o.baseIntervalMs;
    const now = this.clock.now();
    const unknown = (): ProtocolStatus => ({ state: 'unknown', checkedAt: now });
    this.snapshot = { sources: [], status: { ndi: unknown(), omt: unknown(), srt: unknown() }, scanning: false, lastScanAt: null };
    const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
    this.srt = new SrtSupervisor(this.bridge, this.clock, storage, {
      setSources: list => this.applySrtSources(list),
      setStatus: st => this.setStatus('srt', st),
      emit: e => this.emit(e),
    });
  }

  // ── subscription API ──────────────────────────────────────────────────────
  subscribe = (cb: () => void): (() => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getSnapshot = (): DiscoverySnapshot => this.snapshot;
  onEvent(cb: (e: DiscoveryEvent) => void): () => void { this.eventListeners.add(cb); return () => { this.eventListeners.delete(cb); }; }
  get currentIntervalMs() { return this.interval; }

  private emit(e: DiscoveryEvent) { this.eventListeners.forEach(cb => { try { cb(e); } catch { /* listener errors never break discovery */ } }); }
  private publish(extra: Partial<DiscoverySnapshot> = {}) {
    const sources = [...this.known.values()].map(({ fp: _fp, ...s }) => s)
      .sort((a, b) => a.protocol.localeCompare(b.protocol) || a.label.localeCompare(b.label));
    this.snapshot = { ...this.snapshot, ...extra, sources };
    this.listeners.forEach(cb => cb());
  }
  private setStatus(p: DiscoveryProtocol, status: ProtocolStatus) {
    const prev = this.snapshot.status[p];
    if (prev.state === status.state && prev.detail === status.detail) return;
    this.snapshot = { ...this.snapshot, status: { ...this.snapshot.status, [p]: status } };
    this.emit({ type: 'status', protocol: p, status });
    this.listeners.forEach(cb => cb());
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.unwatch = this.watchVisibility ? this.watchVisibility(() => this.onVisibility()) : null;
    this.srt.start();
    if (this.isVisible()) void this.scanNow(); else this.armTimer();
  }
  stop() {
    this.running = false;
    this.disarm();
    this.unwatch?.(); this.unwatch = null;
    this.srt.stop();
  }
  private onVisibility() {
    if (!this.running) return;
    if (this.isVisible()) { this.interval = this.o.baseIntervalMs; this.disarm(); void this.scanNow(); } else this.disarm();
  }
  private disarm() { if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; } }
  private armTimer() {
    this.disarm();
    if (!this.running || !this.isVisible()) return;
    this.timer = this.clock.setTimeout(() => { this.timer = null; void this.scanNow(); }, this.interval);
  }

  /** One discovery pass (also the manual "Rescan" fallback). Concurrent calls share one scan. */
  scanNow(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.scanOnce().finally(() => { this.inflight = null; this.armTimer(); });
    return this.inflight;
  }

  private async scanOnce() {
    this.snapshot = { ...this.snapshot, scanning: true }; this.listeners.forEach(cb => cb());
    const now = this.clock.now();
    const native = this.bridge.hasNative();
    let changed = false;
    if (!native) {
      this.setStatus('ndi', mapNdiStatus(null, false, now));
      this.setStatus('omt', { state: 'unsupported', detail: 'OMT discovery needs the desktop or native app.', checkedAt: now });
    } else {
      const [ndi, omt, ndiSt] = await Promise.allSettled([this.bridge.scanNdi(), this.bridge.scanOmt(), this.bridge.ndiStatus()]);
      const st = mapNdiStatus(ndiSt.status === 'fulfilled' ? ndiSt.value : null, true, now);
      this.setStatus('ndi', ndi.status === 'rejected' ? { state: 'error', detail: String((ndi.reason as any)?.message ?? ndi.reason), checkedAt: now } : st);
      this.setStatus('omt', omt.status === 'rejected'
        ? { state: 'error', detail: String((omt.reason as any)?.message ?? omt.reason), checkedAt: now }
        : { state: 'ok', detail: 'Listening for _omt._tcp announcements.', checkedAt: now });
      // A failed scan says nothing about whether sources are still there — only count misses on a good answer.
      if (ndi.status === 'fulfilled') changed = this.reconcile('ndi', ndi.value, now) || changed;
      if (omt.status === 'fulfilled') changed = this.reconcile('omt', omt.value, now) || changed;
    }
    changed = this.dropExpired(now) || changed;
    this.interval = changed ? this.o.baseIntervalMs : Math.min(this.o.maxIntervalMs, Math.round(this.interval * 1.5));
    this.publish({ scanning: false, lastScanAt: now });
  }

  private reconcile(protocol: 'ndi' | 'omt', found: NativeSourceInfo[], now: number): boolean {
    let changed = false;
    const seen = new Set<string>();
    for (const raw of found) {
      const id = stableSourceId(protocol, raw);
      seen.add(id);
      const fp = fingerprint(raw);
      const prev = this.known.get(id);
      const next = { ...raw, id, kind: protocol, protocol, online: true, origin: 'announced' as SourceOrigin,
        firstSeen: prev?.firstSeen ?? now, lastSeen: now, misses: 0, fp };
      this.known.set(id, next);
      if (!prev) { changed = true; this.emit({ type: 'added', source: strip(next) }); }
      else {
        if (!prev.online) { changed = true; this.emit({ type: 'online', source: strip(next) }); }
        if (prev.fp !== fp) { changed = true; this.emit({ type: 'changed', source: strip(next) }); }
      }
    }
    for (const [id, s] of this.known) {
      if (s.protocol !== protocol || s.origin !== 'announced' || seen.has(id)) continue;
      const misses = s.misses + 1;
      const wasOnline = s.online;
      const online = misses < this.o.offlineAfterMisses;
      const next = { ...s, misses, online };
      this.known.set(id, next);
      if (wasOnline && !online) { changed = true; this.emit({ type: 'offline', source: strip(next) }); }
    }
    return changed;
  }

  private dropExpired(now: number): boolean {
    let changed = false;
    for (const [id, s] of this.known) {
      if (!s.online && s.origin === 'announced' && now - s.lastSeen >= this.o.dropAfterMs) {
        this.known.delete(id); changed = true; this.emit({ type: 'removed', source: strip(s) });
      }
    }
    return changed;
  }

  /** SRT supervisor hands over its full list; diff against what we already hold for srt. */
  private applySrtSources(list: Array<NativeSourceInfo & { origin: SourceOrigin }>) {
    const now = this.clock.now();
    const seen = new Set<string>();
    for (const raw of list) {
      seen.add(raw.id);
      const fp = fingerprint(raw) + String(raw.online);
      const prev = this.known.get(raw.id);
      const next = { ...raw, kind: 'srt' as const, protocol: 'srt' as const, online: !!raw.online, origin: raw.origin,
        firstSeen: prev?.firstSeen ?? now, lastSeen: raw.online ? now : (prev?.lastSeen ?? now), misses: 0, fp };
      this.known.set(raw.id, next);
      if (!prev) this.emit({ type: 'added', source: strip(next) });
      else if (prev.online !== next.online) this.emit({ type: next.online ? 'online' : 'offline', source: strip(next) });
      else if (prev.fp !== fp) this.emit({ type: 'changed', source: strip(next) });
    }
    for (const [id, s] of this.known) {
      if (s.protocol === 'srt' && !seen.has(id)) { this.known.delete(id); this.emit({ type: 'removed', source: strip(s) }); }
    }
    this.publish();
  }
}
function strip(s: DiscoveredSource & { fp?: string }): DiscoveredSource { const { fp: _fp, ...rest } = s as any; return rest; }

function safeLocalStorage(): StorageLike | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ── SRT: honest equivalents of "auto detect" ─────────────────────────────────
export interface SrtEndpoint {
  id: string;
  mode: 'listener' | 'caller';
  name: string;
  host?: string;            // callers only
  port: number;
  latencyMs: number;
  /** Auto-listen (listener) / auto-reconnect (caller) on launch. */
  autoStart: boolean;
  /** Passphrases are never persisted; an encrypted endpoint needs one typed again, so it is not auto-started. */
  needsPassphrase: boolean;
  lastUsed?: number;
}
export type SrtLinkState = 'idle' | 'starting' | 'listening' | 'connected' | 'retrying' | 'unavailable' | 'needs-passphrase';

/** Interpret srt_stats without trusting prose: explicit flag first, then traffic, then status words. */
export function srtLinkState(mode: 'listener' | 'caller', stats: any): 'down' | 'up' | 'waiting' {
  if (!stats) return 'down';
  if (typeof stats.connected === 'boolean') return stats.connected ? 'up' : (mode === 'listener' ? 'waiting' : 'down');
  const bitrate = Number(stats.bitrateMbps ?? stats.BitrateMbps ?? 0);
  if (bitrate > 0) return 'up';
  const status = String(stats.status ?? stats.Status ?? '');
  if (/not (listening|connected)|registered only|unavailable/i.test(status)) return 'down';
  if (mode === 'listener' && /listening/i.test(status)) return 'waiting';
  if (/^connected/i.test(status)) return 'up';
  return 'down';
}

interface SrtHooks {
  setSources(list: Array<NativeSourceInfo & { origin: SourceOrigin }>): void;
  setStatus(s: ProtocolStatus): void;
  emit(e: DiscoveryEvent): void;
}
const SRT_KEY = 'ambo.srt.endpoints.v1';
const BACKOFF = [2000, 4000, 8000, 15000, 30000, 60000];

export class SrtSupervisor {
  private endpoints: SrtEndpoint[] = [];
  private state = new Map<string, { link: SrtLinkState; attempt: number; nextTryAt: number; detail?: string }>();
  private transport: SrtTransportStatus | null = null;
  private timer: unknown = null;
  private running = false;
  private ticking = false;

  constructor(private bridge: DiscoveryBridge, private clock: Clock, private storage: StorageLike | null, private hooks: SrtHooks, private pollMs = 5000) {
    this.load();
  }

  list(): SrtEndpoint[] { return this.endpoints.map(e => ({ ...e })); }
  linkState(id: string): SrtLinkState { return this.state.get(id)?.link ?? 'idle'; }

  private load() {
    try {
      const raw = this.storage?.getItem(SRT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) this.endpoints = arr.filter(e => e && typeof e.id === 'string' && Number.isFinite(e.port));
    } catch { this.endpoints = []; }
  }
  private save() { try { this.storage?.setItem(SRT_KEY, JSON.stringify(this.endpoints)); } catch { /* quota / private mode */ } }

  /** Remember an endpoint. Same mode+host+port is the same endpoint (stable id), so re-adding never duplicates. */
  remember(e: { mode: 'listener' | 'caller'; host?: string; port: number; name?: string; latencyMs?: number; autoStart?: boolean; needsPassphrase?: boolean }): SrtEndpoint {
    const host = e.mode === 'caller' ? (e.host || '127.0.0.1') : undefined;
    const id = e.mode === 'listener' ? `srt:listen:${e.port}` : `srt:call:${host}:${e.port}`;
    const prev = this.endpoints.find(x => x.id === id);
    const next: SrtEndpoint = {
      id, mode: e.mode, host, port: e.port,
      name: e.name || (e.mode === 'listener' ? `SRT listener :${e.port}` : `SRT ${host}:${e.port}`),
      latencyMs: e.latencyMs ?? prev?.latencyMs ?? 120,
      autoStart: e.autoStart ?? prev?.autoStart ?? false,
      needsPassphrase: e.needsPassphrase ?? prev?.needsPassphrase ?? false,
      lastUsed: this.clock.now(),
    };
    this.endpoints = prev ? this.endpoints.map(x => x.id === id ? next : x) : [...this.endpoints, next];
    this.save(); this.render();
    if (this.running) void this.tick();
    return next;
  }
  async forget(id: string) {
    this.endpoints = this.endpoints.filter(e => e.id !== id);
    this.state.delete(id); this.save();
    try { await this.bridge.srtStop(id); } catch { /* already gone */ }
    this.render();
  }
  setAutoStart(id: string, autoStart: boolean) {
    this.endpoints = this.endpoints.map(e => e.id === id ? { ...e, autoStart } : e);
    this.save(); this.render();
    if (this.running) void this.tick();
  }
  /** One-shot start of a remembered endpoint (works for endpoints that are not auto-start). */
  async startNow(id: string, passphrase?: string) {
    const e = this.endpoints.find(x => x.id === id);
    if (!e) return;
    this.state.set(id, { link: 'starting', attempt: 0, nextTryAt: 0 });
    await this.open(e, passphrase);
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }
  stop() { this.running = false; if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; } }

  private async open(e: SrtEndpoint, passphrase?: string): Promise<boolean> {
    const s = this.state.get(e.id) ?? { link: 'starting' as SrtLinkState, attempt: 0, nextTryAt: 0 };
    let res: any;
    try {
      res = e.mode === 'listener'
        ? await this.bridge.srtListen({ streamId: e.id, name: e.name, port: e.port, latencyMs: e.latencyMs, ...(passphrase ? { passphrase } : {}) })
        : await this.bridge.srtCall({ streamId: e.id, name: e.name, host: e.host || '127.0.0.1', port: e.port, latencyMs: e.latencyMs, ...(passphrase ? { passphrase } : {}) });
    } catch (err: any) { res = { success: false, error: err?.message }; }
    if (res?.success) {
      this.state.set(e.id, { link: e.mode === 'listener' ? 'listening' : 'starting', attempt: 0, nextTryAt: 0 });
      return true;
    }
    const attempt = s.attempt + 1;
    const unavailable = res?.transportAvailable === false;
    this.state.set(e.id, {
      link: unavailable ? 'unavailable' : 'retrying', attempt,
      nextTryAt: this.clock.now() + BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)],
      detail: res?.reason || res?.error || 'Could not start',
    });
    return false;
  }

  /** Poll live state, restart what dropped (with backoff), refresh the source list and protocol status. */
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.clock.now();
      this.transport = await this.bridge.srtTransport().catch(() => null);
      if (!this.bridge.hasNative() || !this.transport) {
        this.hooks.setStatus({ state: 'unsupported', detail: 'SRT needs the desktop or native app; a browser cannot open SRT sockets.', checkedAt: now });
      } else if (!this.transport.transportAvailable) {
        this.hooks.setStatus({ state: 'transport-missing', detail: this.transport.reason || 'The native host has no SRT transport.', checkedAt: now });
      } else {
        const live = this.endpoints.filter(e => this.linkState(e.id) === 'connected' || this.linkState(e.id) === 'listening').length;
        this.hooks.setStatus({ state: 'ok', detail: this.endpoints.length ? `${live}/${this.endpoints.length} remembered endpoints live. SRT senders are not announced; endpoints are added by address.` : 'No SRT endpoints saved. SRT senders are not announced; add one by address or keep a listener open.', checkedAt: now });
      }
      if (this.transport?.transportAvailable) {
        for (const e of this.endpoints) {
          const st = this.state.get(e.id);
          const link = st?.link ?? 'idle';
          if (link === 'needs-passphrase') continue;
          if (link === 'listening' || link === 'connected' || link === 'starting') {
            const stats = await this.bridge.srtStats(e.id).catch(() => null);
            const k = srtLinkState(e.mode, stats);
            if (!stats) this.state.set(e.id, { link: 'retrying', attempt: 1, nextTryAt: now + BACKOFF[0], detail: 'Session lost' });
            else this.state.set(e.id, { link: k === 'up' ? 'connected' : e.mode === 'listener' ? 'listening' : 'starting', attempt: 0, nextTryAt: 0, detail: stats.status });
            continue;
          }
          // idle / retrying: auto-start endpoints, and probe the last-used caller hosts at the slowest backoff.
          const due = !st || now >= st.nextTryAt;
          if (!due) continue;
          if (e.autoStart) {
            if (e.needsPassphrase) this.state.set(e.id, { link: 'needs-passphrase', attempt: 0, nextTryAt: 0, detail: 'Encrypted: enter the passphrase to start' });
            else await this.open(e);
          }
        }
      }
      this.render();
    } finally {
      this.ticking = false;
      if (this.running) this.timer = this.clock.setTimeout(() => { this.timer = null; void this.tick(); }, this.pollMs);
    }
  }

  private render() {
    const t = this.transport;
    const list = this.endpoints.map(e => {
      const st = this.state.get(e.id);
      const link = st?.link ?? 'idle';
      const online = link === 'connected';
      const origin: SourceOrigin = e.mode === 'listener' ? 'auto-listen' : 'remembered';
      const note = link === 'connected' ? 'Receiving' : link === 'listening' ? 'Listening, waiting for an encoder'
        : link === 'unavailable' ? (t?.reason || st?.detail || 'SRT transport unavailable')
        : link === 'retrying' ? `Retrying (attempt ${st?.attempt ?? 1})` : link === 'needs-passphrase' ? 'Passphrase needed' : 'Not started';
      return {
        id: e.id, label: e.name, kind: 'srt' as const, formats: [], online, origin,
        url: e.mode === 'listener' ? `srt://:${e.port}?mode=listener` : `srt://${e.host}:${e.port}?mode=caller`,
        status: `${e.mode === 'listener' ? 'Auto-listen' : 'Remembered'} - ${note}`,
        discoveryMethod: e.mode === 'listener' ? 'SRT auto-listen (not announced)' : 'Remembered SRT endpoint (not announced)',
      };
    });
    this.hooks.setSources(list);
  }
}

// ── singleton for the app ────────────────────────────────────────────────────
let shared: SourceDiscovery | null = null;
export function getSourceDiscovery(): SourceDiscovery { return shared ??= new SourceDiscovery(); }
export function __resetSourceDiscoveryForTests() { shared?.stop(); shared = null; }
