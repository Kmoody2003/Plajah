// ─── Matter casting bridge (TV) ───────────────────────────────────────────────
// JS end of the native PlajahMatter plugin (android/.../PlajahMatterPlugin.kt +
// MatterCommandReceiver.kt). On a TV whose OS ships a Matter casting agent, Plajah is a Matter
// "Content App": a phone/tablet Matter casting client can launch Plajah links, search, control
// playback and send remote keys. This module turns those commands into the app's existing events.
//
// On stock Google TV / Android TV (no Matter agent in the OS) no command ever arrives; everything
// here is inert. Off the native Android shell it is a no-op.
//
// Events this module DISPATCHES on window (players/App can listen):
//   tv:media-play-pause | tv:media-next | tv:media-prev   existing TV media events (GlobalPlayerContext
//                                                          and TVNavigationLayer already handle them)
//   plajah:media-seek  {positionMs, deltaMs?, source:'matter'}   absolute seek target in ms
//   plajah:media-stop  {source:'matter'}                         stop playback (pause + rewind to 0)
//   plajah:tv-search   {query, parameters, autoPlay, data?, startPositionMs?, source:'matter'}
//                       — also kept for consumePendingMatterSearch() so a search view that mounts
//                       after the event can still read it.
//   NAVIGATE {target, params} / plajah:open-home        App's existing navigation events
//   keydown/keyup KeyboardEvents (with keyCode/which)   KeypadInput, as TVNavigationLayer expects
//
// Mount: call startMatterCasting() once on TV boot, and render useMatterPlaybackReporter() inside
// <GlobalPlayerProvider> (e.g. a tiny <MatterPlaybackReporter/> component) so attribute reads and
// command statuses reflect the real player.

import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useRef } from 'react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../../contexts/GlobalPlayerContext';

export type MatterCluster =
  | 'ContentLauncher' | 'MediaPlayback' | 'KeypadInput' | 'TargetNavigator' | 'AccountLogin' | 'ApplicationBasic';

export interface MatterCommandEvent {
  cluster: MatterCluster | string;
  command: string;
  payload: Record<string, any>;
}

export type MatterPlaybackStateName = 'playing' | 'paused' | 'notPlaying' | 'buffering';

export interface MatterPlaybackReport {
  state: MatterPlaybackStateName;
  positionMs: number;
  /** null/0 = unknown or live. */
  durationMs?: number | null;
  /** 1 = normal, 0 = paused. */
  speed?: number;
  /** Set when the position jumped (seek), so subscribers get a SampledPosition report. */
  seeked?: boolean;
}

export interface MatterStatus {
  /** Does this TV's OS run a Matter casting agent Plajah can bind to? */
  agentPresent: boolean;
  vendorId: number;
  productId: number;
  /** true while the manifest uses a CSA test VID (0xFFF1-0xFFF4). */
  testVendorId: boolean;
}

interface PlajahMatterPlugin {
  addListener(event: 'matterCommand', cb: (e: MatterCommandEvent) => void): Promise<PluginListenerHandle>;
  reportPlaybackState(report: MatterPlaybackReport): Promise<void>;
  reportCurrentTarget(opts: { target: number }): Promise<void>;
  getStatus(): Promise<MatterStatus>;
}

const PlajahMatter = registerPlugin<PlajahMatterPlugin>('PlajahMatter');

const isNativeAndroid = (): boolean => {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'; } catch { return false; }
};

// ── TargetNavigator targets — keep in sync with MatterContract.TARGETS (MatterCasting.kt) ──
export const MATTER_TARGETS: ReadonlyArray<{ id: number; name: string }> = [
  { id: 0, name: 'Home' },
  { id: 1, name: 'Live TV' },
  { id: 2, name: 'Movies & TV' },
  { id: 3, name: 'Reello' },
  { id: 4, name: 'Search' },
];

// ── Last reported playback (for explicit Play vs Pause and skip maths) ──────────────────────
let lastReport: (MatterPlaybackReport & { at: number }) | null = null;

const estimatedPositionMs = (): number => {
  if (!lastReport) return 0;
  const { state, positionMs, at, speed, durationMs } = lastReport;
  let p = positionMs;
  if (state === 'playing') p += (Date.now() - at) * (speed && speed > 0 ? speed : 1);
  return durationMs && durationMs > 0 ? Math.min(p, durationMs) : p;
};

/** Report the active player's state to native. Safe to call anywhere; no-op off Android. */
export function reportMatterPlaybackState(report: MatterPlaybackReport): void {
  lastReport = { ...report, at: Date.now() };
  if (!isNativeAndroid()) return;
  PlajahMatter.reportPlaybackState({
    state: report.state,
    positionMs: Math.max(0, Math.round(report.positionMs || 0)),
    durationMs: report.durationMs && isFinite(report.durationMs) ? Math.round(report.durationMs) : null,
    speed: report.speed ?? (report.state === 'playing' ? 1 : 0),
    seeked: !!report.seeked,
  }).catch(() => {});
}

export async function getMatterStatus(): Promise<MatterStatus | null> {
  if (!isNativeAndroid()) return null;
  try { return await PlajahMatter.getStatus(); } catch { return null; }
}

// ── Pending search (LaunchContent may arrive before the search view mounts) ──────────────────
const PENDING_SEARCH_KEY = 'plajah:matter:pending-search';
let pendingSearch: string | null = null;

/** Read-and-clear the last Matter LaunchContent query, for a search view mounting late. */
export function consumePendingMatterSearch(): string | null {
  let q = pendingSearch;
  pendingSearch = null;
  try {
    q = q ?? sessionStorage.getItem(PENDING_SEARCH_KEY);
    sessionStorage.removeItem(PENDING_SEARCH_KEY);
  } catch { /* storage unavailable */ }
  return q;
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────
const fire = (name: string, detail?: unknown) => {
  window.dispatchEvent(detail === undefined ? new CustomEvent(name) : new CustomEvent(name, { detail }));
};

const navigate = (target: string, params?: Record<string, unknown>) => fire('NAVIGATE', { target, params });

/** Synthetic key press the way MainActivity.dispatchKeyEvent does it: key + keyCode/which. */
const pressKey = (key: string, keyCode: number) => {
  for (const type of ['keydown', 'keyup'] as const) {
    const e = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
    try {
      Object.defineProperty(e, 'keyCode', { get: () => keyCode });
      Object.defineProperty(e, 'which', { get: () => keyCode });
    } catch { /* read-only in some engines; e.key still matches */ }
    window.dispatchEvent(e);
  }
};

// ── ContentLauncher.LaunchURL → existing deep-link routing ───────────────────────────────────
/**
 * Native has already restricted the URL to https://plajah.com. Links App can route without a
 * reload go through its NAVIGATE event (the same handlers its deep-link init uses); anything else
 * becomes a same-origin navigation, which re-runs App's `?id=&type=` deep-link init.
 */
export function routeMatterUrl(rawUrl: string): void {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return; }
  const sp = url.searchParams;
  const type = sp.get('type');
  const id = sp.get('id') || '';
  const seg = url.pathname.split('/').filter(Boolean);

  // Live channel: same shape App builds for liveChannelFocus from `?type=channel&id=…&n=…&source=…`.
  if (type === 'channel') {
    const number = sp.get('n') || undefined;
    const sourceId = sp.get('source') || (id.startsWith('source:') ? id.slice(7) : undefined);
    const focus = id.startsWith('owner:') ? { ownerId: id.slice(6), number, sourceId }
      : id.startsWith('plajah:') ? { plajahId: id.slice(7), number, sourceId }
      : { plajahId: sourceId ? undefined : id || undefined, number, sourceId };
    navigate('LIVE_HUB', { focus });
    return;
  }
  // Reello / short video: `?type=video|reello&id=`, `?reello=`, `/reello/:id`, `/video/:id`.
  const videoId = (type === 'video' || type === 'reello') ? id
    : sp.get('reello') || ((seg[0] === 'reello' || seg[0] === 'video') ? seg[1] : '') || '';
  if (videoId) {
    navigate('RELLO', { videoId });
    return;
  }
  // Bare home.
  if (seg.length === 0 && [...sp.keys()].length === 0) {
    fire('plajah:open-home');
    return;
  }
  // Everything else (albums, books, profiles, playlists, …): let App's deep-link init handle it.
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.location.assign(target);
  }
}

// ── MediaPlayback ───────────────────────────────────────────────────────────────────────────
function handleMediaPlayback(command: string, payload: Record<string, any>): void {
  const state = lastReport?.state;
  switch (command) {
    case 'Play':
      // tv:media-play-pause toggles, so only send it when we're not already playing.
      if (state !== 'playing' && state !== 'buffering') fire('tv:media-play-pause');
      break;
    case 'Pause':
      if (state === 'playing' || state === 'buffering' || state === undefined) fire('tv:media-play-pause');
      break;
    case 'Stop':
      fire('plajah:media-stop', { source: 'matter' });
      break;
    case 'StartOver':
      fire('plajah:media-seek', { positionMs: 0, source: 'matter' });
      break;
    case 'Next':
      fire('tv:media-next');
      break;
    case 'Previous':
      fire('tv:media-prev');
      break;
    case 'SkipForward':
    case 'SkipBackward': {
      const delta = Number(payload.deltaMs) || 0;
      const positionMs = typeof payload.positionMs === 'number'
        ? payload.positionMs
        : Math.max(0, estimatedPositionMs() + (command === 'SkipForward' ? delta : -delta));
      fire('plajah:media-seek', { positionMs, deltaMs: command === 'SkipForward' ? delta : -delta, source: 'matter' });
      break;
    }
    case 'Seek':
      fire('plajah:media-seek', { positionMs: Number(payload.positionMs) || 0, source: 'matter' });
      break;
  }
}

// ── KeypadInput (CEC key codes) — keep in sync with MatterContract.SUPPORTED_KEYS ────────────
const KEY_MAP: Record<number, [string, number]> = {
  0x00: ['Enter', 13],        // Select
  0x01: ['ArrowUp', 38],
  0x02: ['ArrowDown', 40],
  0x03: ['ArrowLeft', 37],
  0x04: ['ArrowRight', 39],
  0x0D: ['GoBack', 4],        // Exit → TVNavigationLayer's Back (matches Android KEYCODE_BACK 4)
  0x11: ['ContextMenu', 93],
  0x2B: ['Enter', 13],
  0x30: ['ChannelUp', 427],   // same codes MainActivity.dispatchKeyEvent uses
  0x31: ['ChannelDown', 428],
};
for (let n = 0; n <= 9; n++) KEY_MAP[0x20 + n] = [String(n), 48 + n];

function handleKey(cec: number): void {
  switch (cec) {
    case 0x09: fire('plajah:open-home'); return;                     // RootMenu → Home
    case 0x0A: navigate('SETTINGS'); return;                         // SetupMenu → Settings
    case 0x44: handleMediaPlayback('Play', {}); return;
    case 0x46: handleMediaPlayback('Pause', {}); return;
    case 0x61: fire('tv:media-play-pause'); return;                  // PausePlayFunction
    case 0x45: handleMediaPlayback('Stop', {}); return;
    case 0x4B: fire('tv:media-next'); return;                        // Forward
    case 0x4C: fire('tv:media-prev'); return;                        // Backward
    case 0x48: handleMediaPlayback('SkipBackward', { deltaMs: 10_000 }); return; // Rewind
    case 0x49: handleMediaPlayback('SkipForward', { deltaMs: 10_000 }); return;  // FastForward
  }
  const mapped = KEY_MAP[cec];
  if (mapped) pressKey(mapped[0], mapped[1]);
}

// ── TargetNavigator ─────────────────────────────────────────────────────────────────────────
function handleTarget(target: number): void {
  switch (target) {
    case 0: fire('plajah:open-home'); break;
    case 1: navigate('LIVE_HUB'); break;
    case 2: navigate('MOVIES_TV'); break;
    case 3: navigate('VIDEOS'); break;
    case 4: openSearch({ query: '', parameters: [], autoPlay: false }); break;
  }
}

function openSearch(detail: Record<string, any>): void {
  const query = String(detail.query || '');
  pendingSearch = query;
  try { sessionStorage.setItem(PENDING_SEARCH_KEY, query); } catch { /* */ }
  fire('plajah:tv-search', { ...detail, query, source: 'matter' });
}

// ── dispatcher ──────────────────────────────────────────────────────────────────────────────
export function handleMatterCommand(e: MatterCommandEvent): void {
  const payload = e?.payload || {};
  switch (e?.cluster) {
    case 'ContentLauncher':
      if (e.command === 'LaunchURL' && payload.url) routeMatterUrl(String(payload.url));
      else if (e.command === 'LaunchContent') openSearch(payload);
      break;
    case 'MediaPlayback':
      handleMediaPlayback(e.command, payload);
      break;
    case 'KeypadInput':
      if (e.command === 'SendKey') handleKey(Number(payload.keyCode));
      break;
    case 'TargetNavigator':
      if (e.command === 'NavigateTarget') handleTarget(Number(payload.target));
      break;
  }
}

let started: Promise<PluginListenerHandle | null> | null = null;

/**
 * Subscribe to Matter commands. Idempotent; returns a stop function. Commands that arrived before
 * this call (including the one that cold-launched the app) are replayed by the native side.
 */
export function startMatterCasting(): () => void {
  if (!isNativeAndroid()) return () => {};
  if (!started) {
    started = PlajahMatter.addListener('matterCommand', (ev) => {
      try { handleMatterCommand(ev); } catch (err) { console.warn('[matter] command failed', err); }
    }).catch(() => null);
  }
  return () => {
    const p = started;
    started = null;
    p?.then((h) => h?.remove()).catch(() => {});
  };
}

// ── GlobalPlayer reporter (mount under <GlobalPlayerProvider>) ────────────────────────────────
/**
 * Mirrors GlobalPlayerContext into the native Matter state (CurrentState / SampledPosition /
 * Duration / PlaybackSpeed), and gives the global player the plajah:media-seek / plajah:media-stop
 * events without editing the player. Reports on play/pause, track change, seek jumps, and a 10 s
 * heartbeat while playing (attribute reads extrapolate between reports).
 */
export function useMatterPlaybackReporter(): void {
  const { isPlaying, currentTrack, currentVideo, audioSource, playbackRate, pause } = useGlobalPlayerState();
  const { currentTime, duration, seek } = useGlobalPlayerProgress();
  const last = useRef<{ state: string; pos: number; at: number; mediaKey: string } | null>(null);

  const hasMedia = !!(currentTrack || currentVideo) && !!audioSource;
  const mediaKey = String((currentTrack as any)?.id ?? (currentVideo as any)?.id ?? '');

  useEffect(() => {
    if (!isNativeAndroid()) return;
    const state: MatterPlaybackStateName = !hasMedia ? 'notPlaying' : isPlaying ? 'playing' : 'paused';
    const pos = Math.max(0, (currentTime || 0) * 1000);
    const now = Date.now();
    const prev = last.current;
    const expected = prev ? prev.pos + (prev.state === 'playing' ? now - prev.at : 0) : 0;
    const seeked = !!prev && prev.mediaKey === mediaKey && Math.abs(pos - expected) > 2500;
    const due = !prev || prev.state !== state || prev.mediaKey !== mediaKey || seeked || now - prev.at > 10_000;
    if (!due) return;
    last.current = { state, pos, at: now, mediaKey };
    const durMs = duration && isFinite(duration) && duration > 0 ? duration * 1000 : null;
    reportMatterPlaybackState({
      state,
      positionMs: pos,
      durationMs: durMs,
      speed: state === 'playing' ? (playbackRate || 1) : 0,
      seeked,
    });
  }, [hasMedia, isPlaying, currentTime, duration, playbackRate, mediaKey]);

  // Seek / stop for the global player. Other players (Reello, Movies) listen to the same events.
  useEffect(() => {
    if (!hasMedia) return;
    const onSeek = (e: Event) => {
      const ms = Number((e as CustomEvent)?.detail?.positionMs);
      if (isFinite(ms) && ms >= 0) seek(ms / 1000);
    };
    const onStop = () => { pause(); seek(0); };
    window.addEventListener('plajah:media-seek', onSeek);
    window.addEventListener('plajah:media-stop', onStop);
    return () => {
      window.removeEventListener('plajah:media-seek', onSeek);
      window.removeEventListener('plajah:media-stop', onStop);
    };
  }, [hasMedia, seek, pause]);
}

/** Drop-in component form of the hook: render <MatterPlaybackReporter /> under the provider. */
export function MatterPlaybackReporter(): null {
  useMatterPlaybackReporter();
  return null;
}
