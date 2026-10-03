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

/** Configure the native sync engine (master clock + jitter window). */
export async function nativeSync(masterClock: string, syncTargetMs: number): Promise<void> {
  const invoke = resolveInvoke();
  if (!invoke) return;
  try { await invoke('set_sync', { masterClock, syncTargetMs }); } catch { /* */ }
}

// ── Virtual Video Bus (Inter-App Routing: Ambo ↔ Switcher ↔ Fabula) ──────────

const virtualStreamBus: Map<string, MediaStream> = new Map();
const virtualStreamListeners: Map<string, Set<(stream: MediaStream) => void>> = new Map();

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

export async function scanOmtStreams(): Promise<NativeSourceInfo[]> {
  const invoke = resolveInvoke();
  if (!invoke) return [];
  try {
    const res = await invoke('omt_scan');
    if (res?.streams && Array.isArray(res.streams)) {
      return res.streams.map((s: any) => ({
        id: s.id || s.Id,
        label: s.name || s.Name,
        kind: 'omt' as SourceKind,
        url: s.url || s.Url,
        machineName: s.machineName || s.MachineName,
        streamName: s.streamName || s.StreamName,
        formats: [{ width: s.width || s.Width || 1920, height: s.height || s.Height || 1080, fps: s.fps || s.Fps || 60, interlaced: false }],
        latencyMs: 2,
        clockDomain: 'ptp',
        status: s.status || s.Status,
        discoveryMethod: s.discoveryMethod || s.DiscoveryMethod,
      }));
    }
    return [];
  } catch {
    return [];
  }
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
