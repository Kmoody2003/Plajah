// mediaEngine/bridge.ts — the contract between the shared React UI and the NATIVE
// media engine (Tauri desktop / Capacitor Android). The browser build has no native
// host, so every call degrades to a safe no-op and the UI stays WebRTC/webcam-only.
//
// A native host injects ONE of:
//   • Tauri:      window.__TAURI__.core.invoke('plugin:media-engine|<cmd>', args)
//   • Generic:    window.__plajahMediaEngine = { capabilities, invoke(cmd, args) }
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
