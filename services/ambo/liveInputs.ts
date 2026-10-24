// liveInputs — NDI (and later OMT) network feeds as real pictures and sound in Ambo.
//
// Discovery only ever gave Ambo a NAME for each feed, so the Live tab showed blank tiles. In the
// Windows app the shell now receives the feed (NdiReceiverService) and publishes its newest frame
// at https://localmedia.plajah/__live?id=…&w=…, its audio levels as LIVE_INPUT_LEVELS messages and
// — only once the operator turns that input's audio on — its sound as LIVE_INPUT_AUDIO.
//
// AUDIO RULE: every live input starts MUTED. Previews never make sound, and taking an input to
// Program does not unmute it either; hearing it is always a deliberate per-input switch.

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { isWindowsApp, onNativeMessage } from '../windowsBridgeService';
import { amboAudio } from './amboAudioEngine';

/** NDI, OMT and SRT feeds are received by the Windows app and served as frames at /__live. */
export const isNativeLiveInput = (id?: string | null): boolean => !!id && (id.startsWith('ndi:') || id.startsWith('omt') || id.startsWith('srt:'));

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<any>;
const invoke: Invoke | null = typeof window !== 'undefined' && (window as any).__plajahMediaEngine?.invoke
  ? (cmd, args) => (window as any).__plajahMediaEngine.invoke(cmd, args)
  : null;
const engine = (): Invoke | null => invoke ?? ((window as any).__plajahMediaEngine?.invoke ? (c: string, a?: any) => (window as any).__plajahMediaEngine.invoke(c, a) : null);

// ── Connection (ref-counted; the shell receives a feed only while something shows it) ──
const holders = new Map<string, number>();
const errors = new Map<string, string>();
const releaseTimers = new Map<string, number>();

export function liveInputError(id: string): string | undefined { return errors.get(id); }

async function connect(id: string) {
  const inv = engine();
  if (!inv) { errors.set(id, 'Live video previews need the Plajah Windows app.'); emit(); return; }
  try {
    const r = await inv('connect_source', { id });
    if (r && r.success === false) errors.set(id, r.error || 'This feed could not be opened.');
    else errors.delete(id);
  } catch (e: any) { errors.set(id, e?.message || 'This feed could not be opened.'); }
  emit();
}

function acquire(id: string) {
  const t = releaseTimers.get(id);
  if (t) { clearTimeout(t); releaseTimers.delete(id); }
  const n = holders.get(id) ?? 0;
  holders.set(id, n + 1);
  if (n === 0) void connect(id);
}

function release(id: string) {
  const n = (holders.get(id) ?? 1) - 1;
  if (n > 0) { holders.set(id, n); return; }
  holders.delete(id);
  // A short grace period: tile → Preview → Program hand-offs don't reconnect the feed.
  releaseTimers.set(id, window.setTimeout(() => {
    releaseTimers.delete(id);
    if (!holders.has(id)) {
      setLiveAudio(id, false);
      void engine()?.('disconnect_source', { id }).catch(() => {});
    }
  }, 4000));
}

// ── Frames: one polling loop per feed, at the largest width anyone asked for ──
interface FrameLoop { width: number; fps: number; subs: Set<(b: ImageBitmap) => void>; latest: ImageBitmap | null; timer: number | null; busy: boolean }
const loops = new Map<string, FrameLoop>();

function tick(id: string) {
  const L = loops.get(id);
  if (!L) return;
  L.timer = window.setTimeout(() => tick(id), Math.round(1000 / L.fps));
  if (L.busy) return;
  L.busy = true;
  fetch(`https://localmedia.plajah/__live?id=${encodeURIComponent(id)}&w=${L.width}&_=${Date.now()}`, { cache: 'no-store' })
    .then(r => (r.status === 200 ? r.blob() : null))
    .then(b => (b ? createImageBitmap(b) : null))
    .then(bmp => {
      if (!bmp) return;
      const cur = loops.get(id);
      if (!cur) { bmp.close(); return; }
      const old = cur.latest;
      cur.latest = bmp;
      cur.subs.forEach(fn => { try { fn(bmp); } catch { /* */ } });
      old?.close();
    })
    .catch(() => { /* no frame yet */ })
    .finally(() => { const cur = loops.get(id); if (cur) cur.busy = false; });
}

/**
 * Receive frames of a native live input. `width` ~320 for a tile, ~1280 for Program; the feed is
 * encoded at the largest width currently subscribed. Returns an unsubscribe function.
 */
export function subscribeLiveFrames(id: string, width: number, onFrame: (b: ImageBitmap) => void): () => void {
  if (!isWindowsApp() || !isNativeLiveInput(id)) return () => {};
  acquire(id);
  let L = loops.get(id);
  if (!L) {
    L = { width, fps: width > 480 ? 30 : 8, subs: new Set(), latest: null, timer: null, busy: false };
    loops.set(id, L);
    tick(id);
  } else if (width > L.width) {
    L.width = width;
    L.fps = width > 480 ? 30 : 8;
  }
  L.subs.add(onFrame);
  if (L.latest) onFrame(L.latest);
  return () => {
    const cur = loops.get(id);
    if (cur) {
      cur.subs.delete(onFrame);
      if (cur.subs.size === 0) {
        if (cur.timer) clearTimeout(cur.timer);
        cur.latest?.close();
        loops.delete(id);
      }
    }
    release(id);
  };
}

// ── Levels + audio switch (session-only: every launch starts muted) ──
export interface LiveLevel { peak: [number, number]; rms: [number, number]; hasAudio: boolean; status: string; error?: string | null; width?: number; height?: number }
let levels: Record<string, LiveLevel> = {};
const audioOn = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
function emit() { version++; listeners.forEach(fn => { try { fn(); } catch { /* */ } }); }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function liveLevel(id: string): LiveLevel | undefined { return levels[id]; }
export function isLiveAudioOn(id: string): boolean { return audioOn.has(id); }

/** The ONLY way a live input's sound reaches Ambo's mix. */
export function setLiveAudio(id: string, on: boolean): void {
  if (on === audioOn.has(id)) return;
  if (on) audioOn.add(id); else { audioOn.delete(id); players.get(id)?.stop(); players.delete(id); }
  void engine()?.('live_audio', { id, enabled: on }).catch(() => {});
  emit();
}

/** Re-renders on level / status / audio-switch changes. */
export function useLiveInputs(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

// ── Audio playback: PCM from the shell → Ambo's 'video' channel (mixer, meters, limiter) ──
class PcmPlayer {
  private nextAt = 0;
  private gain: GainNode | null = null;
  constructor(private ctx: AudioContext) {
    this.gain = ctx.createGain();
    const into = amboAudio.channelInput('video') ?? ctx.destination;
    this.gain.connect(into);
  }
  push(pcm: Int16Array, rate: number) {
    const frames = pcm.length / 2;
    if (!frames) return;
    const buf = this.ctx.createBuffer(2, frames, rate);
    const l = buf.getChannelData(0), r = buf.getChannelData(1);
    for (let i = 0; i < frames; i++) { l[i] = pcm[i * 2] / 32768; r[i] = pcm[i * 2 + 1] / 32768; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain!);
    const now = this.ctx.currentTime;
    // ~120 ms jitter buffer; resync if we fell behind or drifted too far ahead.
    if (this.nextAt < now + 0.03 || this.nextAt > now + 0.5) this.nextAt = now + 0.12;
    src.start(this.nextAt);
    this.nextAt += buf.duration;
  }
  stop() { try { this.gain?.disconnect(); } catch { /* */ } this.gain = null; }
}
const players = new Map<string, PcmPlayer>();

if (typeof window !== 'undefined' && isWindowsApp()) {
  onNativeMessage((msg: any) => {
    if (msg.type === 'LIVE_INPUT_LEVELS' && msg.levels) {
      levels = msg.levels;
      emit();
    } else if (msg.type === 'LIVE_INPUT_AUDIO' && msg.id && audioOn.has(msg.id)) {
      const ctx = amboAudio.ensure();
      if (!ctx) return;
      let p = players.get(msg.id);
      if (!p) { p = new PcmPlayer(ctx); players.set(msg.id, p); }
      const bin = atob(msg.pcm);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      p.push(new Int16Array(bytes.buffer), msg.sampleRate || 48000);
    }
  });
}

/** A canvas ref that shows a native live input's moving picture (null-safe outside the Windows app). */
export function useLiveFrameCanvas(id: string | undefined, width = 320): RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, setGotFrame] = useState(false);
  useEffect(() => {
    if (!id || !isNativeLiveInput(id)) return;
    return subscribeLiveFrames(id, width, bmp => {
      const c = ref.current;
      if (!c) return;
      if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
      c.getContext('2d')?.drawImage(bmp, 0, 0);
      setGotFrame(true);
    });
  }, [id, width]);
  return ref;
}
