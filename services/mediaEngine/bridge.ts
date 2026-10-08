// mediaEngine/bridge.ts — the contract between the shared React UI and the NATIVE
// media engine (Tauri desktop / Capacitor Android). The browser build has no native
// host, so every call degrades to a safe no-op and the UI stays WebRTC/webcam-only.
//
// A native host injects ONE of:
//   • Tauri:      window.__TAURI__.core.invoke('plugin:media-engine|<cmd>', args)
//   • Generic:    window.__plajahMediaEngine = { capabilities, invoke(cmd, args) }
// The WinUI shell will use the same generic contract once its Rust/GStreamer
// media engine is enabled; until then capabilities stay conservative.
//
// The Rust crate (plajah-media-engine, gstreamer-rs) implements these commands and
// pushes frames to the UI as GPU texture / shared-memory handles (FrameRef.textureId).
// See NATIVE_MEDIA_ENGINE.md for the full native build blueprint.

import { Capabilities, SourceKind, VideoFormat } from './types';

export interface NativeSourceInfo {
  id: string;
  label: string;
  kind: SourceKind;          // 'decklink' | 'ndi' | 'srt' | ...
  formats: VideoFormat[];
  latencyMs?: number;
  clockDomain?: string;
  url?: string;
  machineName?: string;
  streamName?: string;
  status?: string;
  discoveryMethod?: string;
  /** Set by the discovery manager: false once a source has stopped being announced. */
  online?: boolean;
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<any>;

/** Resolve the native invoke fn for whatever host we're in, or null in the browser. */
function resolveInvoke(): Invoke | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (w.__plajahMediaEngine?.invoke) return (cmd, args) => w.__plajahMediaEngine.invoke(cmd, args);
  const tauri = w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke;
  if (tauri) return (cmd, args) => tauri(`plugin:media-engine|${cmd}`, args || {});
  return null;
}

export function hasNativeEngine(): boolean { return resolveInvoke() !== null; }

/** Capabilities reported by the native host (null in the browser). */
export async function nativeCapabilities(): Promise<Capabilities | null> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try { return (await invoke('capabilities')) as Capabilities; } catch { return null; }
}

/** Enumerate real native inputs — capture cards, NDI senders, SRT listeners, etc. */
export async function listNativeSources(): Promise<NativeSourceInfo[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try { return ((await invoke('list_sources')) as NativeSourceInfo[]) || []; } catch { return []; }
}

/** Force an immediate rescan of NDI streams on the local network. */
export async function scanNdiStreams(): Promise<NativeSourceInfo[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try {
    const res = await invoke('ndi_scan');
    if (res?.streams && Array.isArray(res.streams)) {
      return res.streams.map((s: any) => ({
        id: s.id || s.Id,
        label: s.name || s.Name,
        kind: 'ndi' as SourceKind,
        url: s.url || s.Url,
        machineName: s.machineName || s.MachineName,
        streamName: s.streamName || s.StreamName,
        formats: [{ width: s.width || s.Width || 1920, height: s.height || s.Height || 1080, fps: s.fps || s.Fps || 60, interlaced: false }],
        latencyMs: 12,
        clockDomain: 'ptp',
        status: s.status || s.Status,
        discoveryMethod: s.discoveryMethod || s.DiscoveryMethod,
      }));
    }
    return listNativeSources();
  } catch {
    return listNativeSources();
  }
}

/** Field that may arrive camelCase or PascalCase depending on how the host serialised it. */
const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

/** Everything discoverable on the network in one scan: NDI senders and OMT senders. */
export async function scanNetworkFeeds(): Promise<NativeSourceInfo[]> {
  const [ndi, omt] = await Promise.all([scanNdiStreams(), scanOmtStreams()]);
  // scanNdiStreams falls back to the full source list when the host doesn't answer; keep only network feeds from it.
  return [...ndi.filter(s => s.kind === 'ndi'), ...omt];
}

export interface NdiStatus {
  installed: boolean; version?: string; finderRunning: boolean;
  /** Plain-language reason discovery found nothing (firewall, network, missing runtime…), when there is one. */
  diagnosis?: string; firewallProfile?: string; lastError?: string;
}
/** Why NDI discovery is (or isn't) finding senders. Null in the browser. */
export async function getNdiStatus(): Promise<NdiStatus | null> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try {
    const r = await invoke('ndi_info');
    if (!r) return null;
    return {
      installed: !!pick(r, 'isInstalled', 'IsInstalled'),
      version: pick(r, 'version', 'Version'),
      finderRunning: !!pick(r, 'finderRunning', 'FinderRunning'),
      diagnosis: pick(r, 'diagnosis', 'Diagnosis') || undefined,
      firewallProfile: pick(r, 'firewallProfile', 'FirewallProfile') || undefined,
      lastError: pick(r, 'lastError', 'LastError') || undefined,
    };
  } catch { return null; }
}

/** Ask the engine to connect a native source; returns a frame handle the compositor renders. */
export async function connectNativeSource(id: string): Promise<{ textureId?: string } | null> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try { return (await invoke('connect_source', { id })) as { textureId?: string }; } catch { return null; }
}

export async function disconnectNativeSource(id: string): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('disconnect_source', { id }); } catch { /* */ }
}

/** Route a source to a destination in the native graph (mirrors RouterEngine.route). */
export async function nativeRoute(destId: string, srcId: string): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('route', { destId, srcId }); } catch { /* */ }
}

/** Push the switcher program/preview to the native compositor + tally outputs. */
export async function nativeProgram(program: string, preview: string): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('set_program', { program, preview }); } catch { /* */ }
}

/** Mirror the switcher transition to the native compositor. `position` is 0..1 (0 = idle);
 *  the host renders the same maths as programCompositor.drawTransition. Sent on type/rate
 *  changes and throttled during a transition (see MediaEngine.mirrorTransition). */
export async function nativeTransition(type: string, rateFrames: number, position: number): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('set_transition', { type, rateFrames, position }); } catch { /* */ }
}

export type NativeOutputKind = 'record' | 'rtmp' | 'srt';
/** Start/stop a native program output (RTMP push, SRT caller, ProRes/MXF record). Returns
 *  success:false in the browser or on a host that hasn't implemented it — callers fall back
 *  to the browser paths (MediaRecorder / Plajah live / WHIP). */
export async function nativeOutput(
  action: 'start' | 'stop', output: { id: string; kind: NativeOutputKind; url?: string; streamKey?: string; source?: string },
): Promise<{ success: boolean; error?: string }> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try {
    const r: any = await invoke('set_output', { action, ...output });
    return { success: !!pick(r, 'success', 'Success'), error: pick(r, 'error', 'Error') };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/** Configure the native sync engine (master clock + jitter window). */
export async function nativeSync(masterClock: string, syncTargetMs: number): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('set_sync', { masterClock, syncTargetMs }); } catch { /* */ }
}

// ── Virtual Video Bus (Inter-App Routing: Ambo ↔ Switcher ↔ Fabula) ──────────

const virtualStreamBus: Map<string, MediaStream> = new Map();
const virtualStreamListeners: Map<string, Set<(stream: MediaStream) => void>> = new Map();
const outputRemovalListeners = new Map<string, Set<() => void>>();

/** Revoke an output without stopping the originating camera or call. */
export function unpublishAppOutput(channelId: string): void {
  virtualStreamBus.delete(channelId);
  outputRemovalListeners.get(channelId)?.forEach(cb => cb());
}
export function onAppOutputRemoved(channelId: string, cb: () => void): () => void {
  if (!outputRemovalListeners.has(channelId)) outputRemovalListeners.set(channelId, new Set());
  const listeners = outputRemovalListeners.get(channelId)!;
  listeners.add(cb);
  return () => { listeners.delete(cb); if (!listeners.size) outputRemovalListeners.delete(channelId); };
}

/** Publish an application output (e.g. 'ambo:audience', 'switcher:pgm') onto the platform bus. */
export function publishAppOutput(
  channelId: string,
  stream: MediaStream,
  label = channelId,
  ownerApp = channelId.split(':')[0] || 'app',
): void {
  virtualStreamBus.set(channelId, stream);
  const listeners = virtualStreamListeners.get(channelId);
  if (listeners) {
    listeners.forEach((cb) => cb(stream));
  }

  const invoke = resolveInvoke();
  if (invoke) {
    invoke('register_virtual_channel', { channelId, label, ownerApp, format: '1080p60' }).catch(() => {});
  }
}

/** Retrieve an active application output stream from the bus. */
export function getAppOutputStream(channelId: string): MediaStream | null {
  return virtualStreamBus.get(channelId) ?? null;
}

/** Listen for an application output stream being published or updated. */
export function onAppOutputStream(
  channelId: string,
  cb: (stream: MediaStream) => void,
): () => void {
  if (!virtualStreamListeners.has(channelId)) {
    virtualStreamListeners.set(channelId, new Set());
  }
  const set = virtualStreamListeners.get(channelId)!;
  set.add(cb);

  // If already published, invoke immediately
  const existing = virtualStreamBus.get(channelId);
  if (existing) cb(existing);

  return () => {
    set.delete(cb);
  };
}

// ── Pro Camera Control & Native Codec API ────────────────────────────────────

export async function nativeCameraControl(
  cameraId: string,
  action: string,
  protocol = 'canon_ccapi',
  endpoint = '',
  params?: Record<string, unknown>,
): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { error: 'Native camera control requires desktop host' };
  try {
    return await invoke('camera_control', { cameraId, action, protocol, endpoint, ...params });
  } catch (e: any) {
    return { error: e?.message || 'Camera control failed' };
  }
}

export async function getNativeCodecCapabilities(): Promise<any[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try {
    return (await invoke('get_codecs')) || [];
  } catch {
    return [];
  }
}

// ── Open Media Transport (OMT) Native Protocol Bridge ───────────────────────

/**
 * Real OMT senders on the network (DNS-SD `_omt._tcp`). An empty network gives an empty list —
 * nothing is invented. Resolution and frame rate are not part of the announcement, so none is claimed.
 */
export async function scanOmtStreams(): Promise<NativeSourceInfo[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try {
    const res = await invoke('omt_scan');
    const arr = pick(res, 'streams', 'Streams');
    if (!Array.isArray(arr)) return [];
    return arr.map((s: any): NativeSourceInfo => {
      const w = pick(s, 'width', 'Width') || 0, h = pick(s, 'height', 'Height') || 0, fps = pick(s, 'fps', 'Fps') || 0;
      return {
        id: pick(s, 'id', 'Id'),
        label: pick(s, 'name', 'Name'),
        kind: 'omt' as SourceKind,
        url: pick(s, 'url', 'Url'),
        machineName: pick(s, 'machineName', 'MachineName'),
        streamName: pick(s, 'streamName', 'StreamName'),
        formats: w && h ? [{ width: w, height: h, fps, interlaced: false }] : [],
        status: pick(s, 'status', 'Status'),
        discoveryMethod: pick(s, 'discoveryMethod', 'DiscoveryMethod'),
      };
    });
  } catch { return []; }
}

export async function startOmtBroadcast(args?: {
  streamId?: string;
  name?: string;
  port?: number;
  width?: number;
  height?: number;
  fps?: number;
  audioChannels?: number;
  hasAlpha?: boolean;
}): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try { return await invoke('omt_start_broadcast', args || {}); } catch (e: any) { return { success: false, error: e?.message }; }
}

export async function stopOmtBroadcast(streamId: string): Promise<boolean> {
  const invoke = resolveInvoke();
  if (!invoke) return false;
  try { const res = await invoke('omt_stop_broadcast', { streamId }); return !!res?.success; } catch { return false; }
}

// ── Secure Reliable Transport (SRT) Native Protocol Bridge ──────────────────

export async function startSrtListener(args?: {
  streamId?: string;
  name?: string;
  port?: number;
  latencyMs?: number;
  passphrase?: string;
}): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try { return await invoke('srt_start_listener', args || {}); } catch (e: any) { return { success: false, error: e?.message }; }
}

export async function connectSrtCaller(args: {
  streamId?: string;
  name?: string;
  host: string;
  port?: number;
  latencyMs?: number;
  passphrase?: string;
}): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try { return await invoke('srt_connect_caller', args); } catch (e: any) { return { success: false, error: e?.message }; }
}

export async function stopSrtStream(streamId: string): Promise<boolean> {
  const invoke = resolveInvoke();
  if (!invoke) return false;
  try { const res = await invoke('srt_stop', { streamId }); return !!res?.success; } catch { return false; }
}

export interface SrtTransportStatus {
  /** The host answered the srt_info probe at all (older hosts have no such command). */
  hostAnswered: boolean;
  /** A real SRT transport (libsrt) is linked — when false, srt_* calls only register sessions and move no media. */
  transportAvailable: boolean;
  reason?: string;
}
/** Does the native host carry a real SRT transport? Null in the browser. */
export async function getSrtTransportStatus(): Promise<SrtTransportStatus | null> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try {
    const r = await invoke('srt_info');
    if (!r) return { hostAnswered: false, transportAvailable: false, reason: 'This host does not answer srt_info (older build).' };
    return { hostAnswered: true, transportAvailable: !!pick(r, 'transportAvailable', 'TransportAvailable'), reason: pick(r, 'reason', 'Reason') || undefined };
  } catch (e: any) {
    return { hostAnswered: false, transportAvailable: false, reason: 'This host has no SRT handlers (srt_info failed).' };
  }
}

export async function getSrtStats(streamId: string): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try { const res = await invoke('srt_stats', { streamId }); return res?.stats ?? null; } catch { return null; }
}

// ── Audio Video Bridging (AVB / IEEE 1722 / Milan) Hardware Bridge ──────────

export async function listAvbInterfaces(): Promise<any[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try { const res = await invoke('avb_interfaces'); return res?.interfaces ?? []; } catch { return []; }
}

export async function listAvbEntities(): Promise<any[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try { const res = await invoke('avb_entities'); return res?.entities ?? []; } catch { return []; }
}

export async function configureAvbTalker(args?: {
  streamId?: string;
  name?: string;
  channels?: number;
  sampleRate?: number;
}): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try { return await invoke('avb_talker', args || {}); } catch (e: any) { return { success: false, error: e?.message }; }
}

export async function connectAvbListener(args: {
  streamId?: string;
  entityId: string;
  channels?: number;
  sampleRate?: number;
}): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return { success: false, error: 'Requires native host' };
  try { return await invoke('avb_listener', args); } catch (e: any) { return { success: false, error: e?.message }; }
}

export async function stopAvbStream(streamId: string): Promise<boolean> {
  const invoke = resolveInvoke();
  if (!invoke) return false;
  try { const res = await invoke('avb_stop_stream', { streamId }); return !!res?.success; } catch { return false; }
}

export async function getAvbClockStatus(): Promise<any> {
  const invoke = resolveInvoke();
  if (!invoke) return null;
  try { return await invoke('avb_clock'); } catch { return null; }
}
