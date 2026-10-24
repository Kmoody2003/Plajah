// networkOutputs — Stage's Program (the Master Program Bus) sent out as NDI, OMT and SRT.
//
// The transports live in the Windows app's native engine (ProgramOutputHub.cs): NDI through the NDI
// runtime, OMT through libomtnet, SRT through an ffmpeg + libsrt child (caller or listener, latency,
// passphrase). This module is the TS side: the saved output list, SRT URL helpers, the commands that
// start/stop each output, the status the native sinks report, and the program frame feeder that runs
// only while at least one output is on.
//
// Reconnects: a sink that loses its receiver (SRT drop, NDI receiver gone) reopens on its own in the
// native engine. This manager covers the other half — an output the native side no longer knows
// about (app reload, host restart, start refused) is started again with backoff while it is enabled.
//
// Passphrases are never persisted (same rule as SRT inputs): an enabled encrypted SRT output needs the
// passphrase typed again after a relaunch and shows 'needs-passphrase' until then.

export type NetworkOutputKind = 'ndi' | 'omt' | 'srt';
export type SrtMode = 'caller' | 'listener';

export interface SrtSettings {
  mode: SrtMode;
  /** Receiver host (caller only). */
  host?: string;
  port: number;
  latencyMs: number;
  /** SRT stream ID (some receivers route on it). */
  streamId?: string;
  /** Persisted flag only — the passphrase itself lives in memory. */
  encrypted?: boolean;
}

export interface NetworkOutputConfig {
  id: string;
  kind: NetworkOutputKind;
  /** NDI / OMT source name receivers see; label for SRT. */
  name: string;
  enabled: boolean;
  srt?: SrtSettings;
}

export interface FeedFormat { width: number; height: number; fps: number; bitrateKbps: number }

/** What the native sink reports (ProgramSink.Snapshot). */
export type NativeOutputState = 'starting' | 'waiting' | 'live' | 'retrying' | 'error' | 'stopped';
export interface NativeOutputStatus {
  id: string; kind: NetworkOutputKind; name: string; state: NativeOutputState;
  error?: string | null; url?: string | null; attempt?: number; connections?: number;
  bitrateKbps?: number; framesSent?: number; droppedFrames?: number; detail?: string | null;
}

/** What the UI shows: the native state, or why there is none. */
export type OutputUiState = NativeOutputState | 'off' | 'unsupported' | 'needs-passphrase' | 'restarting';
export interface OutputView {
  config: NetworkOutputConfig;
  state: OutputUiState;
  detail: string;
  error?: string;
  url?: string;
  connections: number;
  bitrateKbps: number;
  framesSent: number;
}

// ── SRT URL helpers (pure) ───────────────────────────────────────────────────

export const SRT_DEFAULT_PORT = 9000;
export const SRT_DEFAULT_LATENCY = 120;

/** Problems with SRT settings, in plain words (empty = fine). */
export function validateSrt(s: Partial<SrtSettings>, passphrase?: string): string[] {
  const out: string[] = [];
  if (s.mode !== 'caller' && s.mode !== 'listener') out.push('Choose caller or listener.');
  if (s.mode === 'caller' && !String(s.host ?? '').trim()) out.push('A caller needs the receiver’s host or IP.');
  if (s.mode === 'caller' && /[\s/?#]/.test(String(s.host ?? '').trim())) out.push('Host must be a bare name or IP (no spaces, slashes or ?).');
  if (!Number.isInteger(s.port) || (s.port as number) < 1 || (s.port as number) > 65535) out.push('Port must be 1–65535.');
  if (!Number.isFinite(s.latencyMs) || (s.latencyMs as number) < 20 || (s.latencyMs as number) > 8000) out.push('Latency must be 20–8000 ms.');
  if (passphrase && (passphrase.length < 10 || passphrase.length > 79)) out.push('An SRT passphrase must be 10–79 characters.');
  if (s.streamId && s.streamId.length > 512) out.push('Stream ID is too long (512 max).');
  return out;
}

/**
 * Parse an srt:// URL as pasted from an encoder or a receiver's settings page. `latency` in SRT URLs is
 * in MILLISECONDS for libsrt URIs but ffmpeg's is MICROSECONDS; values ≥ 20000 are read as µs.
 * The passphrase (if any) is returned separately so callers can keep it out of saved config.
 */
export function parseSrtUrl(url: string): { settings: SrtSettings; passphrase?: string } | { error: string } {
  const raw = url.trim();
  const m = /^srt:\/\/(\[[^\]]+\]|[^:/?#]*)(?::(\d+))?\/?(?:\?(.*))?$/i.exec(raw);
  if (!m) return { error: 'Not an srt:// URL (expected srt://host:port?…).' };
  const host = m[1].replace(/^\[|\]$/g, '');
  const port = m[2] ? Number(m[2]) : NaN;
  if (!Number.isInteger(port)) return { error: 'The URL has no port (srt://host:PORT).' };
  const q = new URLSearchParams(m[3] ?? '');
  const modeQ = (q.get('mode') ?? '').toLowerCase();
  // No mode: an empty host means "listen", a host means "call it" (libsrt's own default rule).
  const mode: SrtMode = modeQ === 'listener' || modeQ === 'server' ? 'listener'
    : modeQ === 'caller' || modeQ === 'client' ? 'caller'
    : (!host || host === '0.0.0.0' || host === '::') ? 'listener' : 'caller';
  const latRaw = Number(q.get('latency') ?? q.get('rcvlatency') ?? q.get('peerlatency') ?? NaN);
  const latencyMs = Number.isFinite(latRaw) ? Math.round(latRaw >= 20000 ? latRaw / 1000 : latRaw) : SRT_DEFAULT_LATENCY;
  const passphrase = q.get('passphrase') ?? undefined;
  const streamId = q.get('streamid') ?? undefined;
  const settings: SrtSettings = {
    mode, port, latencyMs,
    // Kept for listeners too: an encoder's own listener URL tells Stage which host to call.
    ...(host && host !== '0.0.0.0' && host !== '::' ? { host } : {}),
    ...(streamId ? { streamId } : {}),
    ...(passphrase ? { encrypted: true } : {}),
  };
  return { settings, ...(passphrase ? { passphrase } : {}) };
}

/** srt:// URL for display/copying. The passphrase is only included when `withPassphrase` is given. */
export function buildSrtUrl(s: SrtSettings, withPassphrase?: string): string {
  const host = s.mode === 'listener' ? '' : (s.host ?? '');
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const q = new URLSearchParams({ mode: s.mode, latency: String(s.latencyMs) });
  if (s.streamId) q.set('streamid', s.streamId);
  if (withPassphrase) q.set('passphrase', withPassphrase);
  return `srt://${h}:${s.port}?${q.toString()}`;
}

/** The address a receiver must use to reach this output (the mirror of our mode). */
export function srtReceiverHint(s: SrtSettings, thisMachine = 'this-pc'): string {
  return s.mode === 'listener'
    ? `Receivers call srt://${thisMachine}:${s.port} (mode=caller, latency ${s.latencyMs} ms)`
    : `Receiver at ${s.host}:${s.port} must listen (mode=listener)`;
}

// ── Injectables ──────────────────────────────────────────────────────────────

export interface OutputBridge {
  hasNative(): boolean;
  invoke(cmd: string, args?: Record<string, unknown>): Promise<any>;
  /** Subscribe to PROGRAM_OUT_STATUS pushes; returns unsubscribe. */
  onStatus(cb: (msg: { outputs?: NativeOutputStatus[]; srt?: { transportAvailable?: boolean; reason?: string | null } }) => void): () => void;
}
export interface FrameFeeder {
  start(format: FeedFormat): void;
  stop(): void;
  readonly running: boolean;
}
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void }

const realClock: Clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: h => clearTimeout(h as any) };

export const OUTPUTS_KEY = 'ambo.networkOutputs.v1';
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

export const DEFAULT_FORMAT: FeedFormat = { width: 1920, height: 1080, fps: 30, bitrateKbps: 6000 };

export function defaultOutput(kind: NetworkOutputKind, existing: NetworkOutputConfig[] = [], rand = Math.random): NetworkOutputConfig {
  const n = existing.filter(o => o.kind === kind).length + 1;
  const id = `netout_${kind}_${Math.floor(rand() * 1e9).toString(36)}`;
  const base = kind === 'srt' ? 'Stage Program SRT' : 'Stage Program';
  const name = n === 1 ? base : `${base} ${n}`;
  return kind === 'srt'
    ? { id, kind, name, enabled: false, srt: { mode: 'listener', port: SRT_DEFAULT_PORT + existing.filter(o => o.kind === 'srt').length, latencyMs: SRT_DEFAULT_LATENCY } }
    : { id, kind, name, enabled: false };
}

/** The args program_out_start expects (ProgramOutputHub.Start). */
export function startArgs(o: NetworkOutputConfig, f: FeedFormat, passphrase?: string): Record<string, unknown> {
  const a: Record<string, unknown> = { id: o.id, kind: o.kind, name: o.name.trim() || 'Stage Program', fps: f.fps, bitrateKbps: f.bitrateKbps };
  if (o.kind === 'srt' && o.srt) {
    a.srt = {
      mode: o.srt.mode, host: o.srt.mode === 'caller' ? (o.srt.host ?? '').trim() : '', port: o.srt.port,
      latencyMs: o.srt.latencyMs, ...(o.srt.streamId ? { streamId: o.srt.streamId } : {}), ...(passphrase ? { passphrase } : {}),
    };
  }
  return a;
}

// ── Manager ──────────────────────────────────────────────────────────────────

interface Persisted { outputs: NetworkOutputConfig[]; format: FeedFormat }

export class NetworkOutputManager {
  private outputs: NetworkOutputConfig[] = [];
  private format: FeedFormat = { ...DEFAULT_FORMAT };
  private passphrases = new Map<string, string>();
  private native = new Map<string, NativeOutputStatus>();
  private pending = new Map<string, { attempt: number; timer: unknown; error?: string }>();
  private starting = new Set<string>();
  private srtTransport: { available: boolean; reason?: string } | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private views: OutputView[] = [];
  private unsubStatus: (() => void) | null = null;
  private pollTimer: unknown = null;
  private disposed = false;

  constructor(
    private bridge: OutputBridge,
    private feeder: FrameFeeder,
    private storage: StorageLike | null,
    private clock: Clock = realClock,
    private pollMs = 3000,
  ) {
    this.load();
    this.unsubStatus = bridge.onStatus(msg => this.applyStatus(msg));
    this.rebuild();
  }

  // ── read ──
  list(): NetworkOutputConfig[] { return this.outputs.map(o => ({ ...o, srt: o.srt ? { ...o.srt } : undefined })); }
  getFormat(): FeedFormat { return { ...this.format }; }
  getViews(): OutputView[] { return this.views; }
  getVersion(): number { return this.version; }
  srtStatus() { return this.srtTransport; }
  hasPassphrase(id: string) { return this.passphrases.has(id); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  // ── edit ──
  add(kind: NetworkOutputKind): NetworkOutputConfig {
    const o = defaultOutput(kind, this.outputs);
    this.outputs = [...this.outputs, o];
    this.save(); this.rebuild();
    return o;
  }

  /** Change settings. A running output restarts with the new settings. */
  async update(id: string, patch: Partial<Omit<NetworkOutputConfig, 'id' | 'kind'>>, passphrase?: string | null): Promise<void> {
    const cur = this.outputs.find(o => o.id === id);
    if (!cur) return;
    const next: NetworkOutputConfig = { ...cur, ...patch, srt: patch.srt ? { ...cur.srt!, ...patch.srt } : cur.srt };
    if (passphrase === null) { this.passphrases.delete(id); if (next.srt) next.srt = { ...next.srt, encrypted: false }; }
    else if (passphrase) { this.passphrases.set(id, passphrase); if (next.srt) next.srt = { ...next.srt, encrypted: true }; }
    this.outputs = this.outputs.map(o => (o.id === id ? next : o));
    this.save();
    if (next.enabled) await this.startNative(next, true);
    this.rebuild();
  }

  async remove(id: string): Promise<void> {
    this.cancelRetry(id);
    this.outputs = this.outputs.filter(o => o.id !== id);
    this.passphrases.delete(id);
    this.save();
    if (this.native.has(id)) { try { await this.bridge.invoke('program_out_stop', { id }); } catch { /* gone */ } this.native.delete(id); }
    this.syncFeeder(); this.rebuild();
  }

  setFormat(patch: Partial<FeedFormat>): void {
    const f = { ...this.format, ...patch };
    f.width = clampInt(f.width, 320, 3840); f.height = clampInt(f.height, 180, 2160);
    f.fps = [24, 25, 29.97, 30, 50, 59.94, 60].includes(f.fps) ? f.fps : 30;
    f.bitrateKbps = clampInt(f.bitrateKbps, 500, 50000);
    this.format = f;
    this.save();
    if (this.feeder.running) { this.feeder.stop(); this.syncFeeder(); }
    // Bitrate / fps are encoder settings: running outputs restart to pick them up.
    for (const o of this.outputs) if (o.enabled && this.native.has(o.id)) void this.startNative(o, true);
    this.rebuild();
  }

  // ── on / off ──
  async setEnabled(id: string, enabled: boolean, passphrase?: string): Promise<{ ok: boolean; error?: string }> {
    const o = this.outputs.find(x => x.id === id);
    if (!o) return { ok: false, error: 'No such output.' };
    if (passphrase) this.passphrases.set(id, passphrase);
    if (enabled) {
      const errs = o.kind === 'srt' ? validateSrt(o.srt ?? {}, this.passphrases.get(id)) : (o.name.trim() ? [] : ['Give the output a name receivers will see.']);
      if (errs.length) return { ok: false, error: errs.join(' ') };
    }
    this.outputs = this.outputs.map(x => (x.id === id ? { ...x, enabled } : x));
    this.save();
    if (!enabled) {
      this.cancelRetry(id);
      try { await this.bridge.invoke('program_out_stop', { id }); } catch { /* */ }
      this.native.delete(id);
      this.syncFeeder(); this.rebuild();
      return { ok: true };
    }
    const r = await this.startNative({ ...o, enabled: true }, false);
    this.rebuild();
    return r;
  }

  /** Launch: start everything that was left on (encrypted SRT waits for its passphrase). */
  start(): void {
    if (!this.bridge.hasNative()) { this.rebuild(); return; }
    void this.refreshTransport();
    for (const o of this.outputs) if (o.enabled && !this.needsPassphrase(o)) void this.startNative(o, false);
    this.schedulePoll();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubStatus?.();
    if (this.pollTimer !== null) this.clock.clearTimeout(this.pollTimer);
    for (const id of [...this.pending.keys()]) this.cancelRetry(id);
    this.feeder.stop();
  }

  // ── internals ──
  private needsPassphrase(o: NetworkOutputConfig) { return o.kind === 'srt' && !!o.srt?.encrypted && !this.passphrases.has(o.id); }

  private async refreshTransport() {
    try {
      const r = await this.bridge.invoke('srt_info');
      this.srtTransport = r ? { available: !!r.transportAvailable, reason: r.reason ?? undefined } : null;
    } catch { this.srtTransport = null; }
    this.rebuild();
  }

  private async startNative(o: NetworkOutputConfig, restart: boolean): Promise<{ ok: boolean; error?: string }> {
    if (!this.bridge.hasNative()) return { ok: false, error: 'Network outputs need the Plajah Windows app.' };
    if (this.needsPassphrase(o)) { this.rebuild(); return { ok: false, error: 'Enter the SRT passphrase to start.' }; }
    if (this.starting.has(o.id) && !restart) return { ok: true };
    this.starting.add(o.id);
    this.cancelRetry(o.id, false);
    try {
      const r = await this.bridge.invoke('program_out_start', startArgs(o, this.format, this.passphrases.get(o.id)));
      if (r?.success) {
        if (r.status) this.native.set(o.id, r.status as NativeOutputStatus);
        this.pending.delete(o.id);
        this.syncFeeder();
        return { ok: true };
      }
      const error = r?.error || 'The Windows app could not start this output.';
      // SRT without a transport, or a config the host rejects, will not fix itself: no retry loop.
      if (r?.transportAvailable === false) { this.srtTransport = { available: false, reason: error }; this.pending.set(o.id, { attempt: 0, timer: null, error }); return { ok: false, error }; }
      this.scheduleRetry(o.id, error);
      return { ok: false, error };
    } catch (e: any) {
      const error = e?.message || String(e);
      this.scheduleRetry(o.id, error);
      return { ok: false, error };
    } finally {
      this.starting.delete(o.id);
      this.rebuild();
    }
  }

  private scheduleRetry(id: string, error: string) {
    const prev = this.pending.get(id);
    if (prev?.timer) this.clock.clearTimeout(prev.timer);
    const attempt = (prev?.attempt ?? 0) + 1;
    const timer = this.clock.setTimeout(() => {
      const p = this.pending.get(id);
      if (p) p.timer = null;
      const o = this.outputs.find(x => x.id === id);
      if (o?.enabled && !this.disposed) void this.startNative(o, false);
    }, BACKOFF[Math.min(attempt - 1, BACKOFF.length - 1)]);
    this.pending.set(id, { attempt, timer, error });
  }

  private cancelRetry(id: string, clear = true) {
    const p = this.pending.get(id);
    if (p?.timer) this.clock.clearTimeout(p.timer);
    if (clear) this.pending.delete(id); else if (p) p.timer = null;
  }

  private applyStatus(msg: { outputs?: NativeOutputStatus[]; srt?: { transportAvailable?: boolean; reason?: string | null } }) {
    if (msg.srt) this.srtTransport = { available: !!msg.srt.transportAvailable, reason: msg.srt.reason ?? undefined };
    if (Array.isArray(msg.outputs)) {
      const seen = new Set<string>();
      for (const s of msg.outputs) { if (s?.id) { this.native.set(s.id, s); seen.add(s.id); } }
      // An enabled output the native side has forgotten (reload, host restart) is started again.
      for (const o of this.outputs) {
        if (seen.has(o.id)) continue;
        this.native.delete(o.id);
        if (!o.enabled || this.starting.has(o.id) || this.pending.has(o.id) || this.needsPassphrase(o)) continue;
        if (o.kind === 'srt' && this.srtTransport?.available === false) continue;
        this.scheduleRetry(o.id, 'The output stopped in the Windows app; restarting.');
      }
    }
    this.syncFeeder();
    this.rebuild();
  }

  private schedulePoll() {
    if (this.disposed) return;
    if (this.pollTimer !== null) this.clock.clearTimeout(this.pollTimer);
    this.pollTimer = this.clock.setTimeout(async () => {
      this.pollTimer = null;
      if (this.outputs.some(o => o.enabled)) {
        try { const r = await this.bridge.invoke('program_out_status'); if (r) this.applyStatus(r); } catch { /* host busy */ }
      }
      this.schedulePoll();
    }, this.pollMs);
  }

  /** Frames flow only while some output is actually running in the native engine. */
  private syncFeeder() {
    const want = this.outputs.some(o => o.enabled && this.native.has(o.id));
    if (want && !this.feeder.running) this.feeder.start(this.format);
    else if (!want && this.feeder.running) this.feeder.stop();
  }

  private rebuild() {
    const native = this.bridge.hasNative();
    this.views = this.outputs.map((o): OutputView => {
      const n = this.native.get(o.id);
      const p = this.pending.get(o.id);
      const base = { config: o, connections: n?.connections ?? 0, bitrateKbps: n?.bitrateKbps ?? 0, framesSent: n?.framesSent ?? 0, url: n?.url ?? undefined };
      if (!o.enabled) return { ...base, state: 'off', detail: 'Off' };
      if (!native) return { ...base, state: 'unsupported', detail: 'Network outputs run in the Plajah Windows app.' };
      if (o.kind === 'srt' && this.srtTransport && !this.srtTransport.available) return { ...base, state: 'unsupported', detail: this.srtTransport.reason || 'This build has no SRT transport.', error: this.srtTransport.reason };
      if (this.needsPassphrase(o)) return { ...base, state: 'needs-passphrase', detail: 'Encrypted: enter the passphrase to start (it is never saved).' };
      if (n) return { ...base, state: n.state, detail: n.detail || stateWords(n.state), error: n.error ?? undefined };
      if (p) return { ...base, state: p.timer ? 'restarting' : 'error', detail: p.timer ? `Retrying (attempt ${p.attempt})` : (p.error ?? 'Could not start'), error: p.error };
      return { ...base, state: 'starting', detail: 'Starting…' };
    });
    this.version++;
    this.listeners.forEach(fn => { try { fn(); } catch { /* */ } });
  }

  private load() {
    try {
      const raw = this.storage?.getItem(OUTPUTS_KEY);
      const p = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
      if (p && Array.isArray(p.outputs)) {
        this.outputs = p.outputs.filter(o => o && typeof o.id === 'string' && ['ndi', 'omt', 'srt'].includes(o.kind))
          .map(o => ({ ...o, srt: o.srt ? { ...o.srt } : (o.kind === 'srt' ? { mode: 'listener', port: SRT_DEFAULT_PORT, latencyMs: SRT_DEFAULT_LATENCY } : undefined) }));
      }
      if (p?.format) this.format = { ...DEFAULT_FORMAT, ...p.format };
    } catch { this.outputs = []; }
  }

  private save() {
    // Belt and braces: nothing named passphrase ever reaches storage.
    const outputs = this.outputs.map(o => (o.srt ? { ...o, srt: stripSecret(o.srt) } : o));
    try { this.storage?.setItem(OUTPUTS_KEY, JSON.stringify({ outputs, format: this.format } satisfies Persisted)); } catch { /* quota */ }
  }
}

function stripSecret(s: SrtSettings & { passphrase?: string }): SrtSettings {
  const { passphrase: _drop, ...rest } = s;
  return rest;
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

export function stateWords(s: OutputUiState): string {
  switch (s) {
    case 'live': return 'On air';
    case 'waiting': return 'Ready; no receivers yet';
    case 'starting': return 'Starting…';
    case 'retrying': case 'restarting': return 'Reconnecting…';
    case 'error': return 'Error';
    case 'stopped': case 'off': return 'Off';
    case 'unsupported': return 'Not available here';
    case 'needs-passphrase': return 'Passphrase needed';
  }
}
