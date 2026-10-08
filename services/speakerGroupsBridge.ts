// ─── "Play on" speaker / speaker-group bridge ─────────────────────────────────
// Typed wrapper over the native PlajahSpeakers Capacitor plugin (PlajahSpeakersPlugin.kt), which
// discovers real Google Cast speakers and multi-room groups on the LAN via androidx MediaRouter
// and plays a stream URL on the chosen one through a CastSession (Default Media Receiver).
//
// The Web Cast sender SDK does not run inside the Android WebView, so this is the only real path
// to the house's speakers from the APK. Everything is a no-op off the native Android shell.
// On TVs (Google TV has no Cast *sender* module; Fire TV has no Play Services) and wherever
// CastContext can't start, the plugin switches to its direct CASTV2 engine
// (android/.../speakers/DirectCastEngine.kt) behind this same contract.

import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeakerDeviceType = 'group' | 'speaker' | 'tv' | 'receiver' | 'unknown';

export interface SpeakerRoute {
  id: string;
  name: string;
  description: string;
  isGroup: boolean;
  isSelected: boolean;
  /** 0..1, or null when the route doesn't report volume. */
  volume: number | null;
  volumeFixed: boolean;
  deviceType: SpeakerDeviceType;
}

export type SpeakerSessionState =
  | 'current' | 'starting' | 'started' | 'failed' | 'ending' | 'ended' | 'resuming' | 'suspended';

export interface SpeakerSession {
  state: SpeakerSessionState;
  connected: boolean;
  deviceName?: string;
  routeId?: string;
  isGroup?: boolean;
  volume?: number;
  media?: SpeakerMediaStatus;
}

export interface SpeakerMediaStatus {
  playerState: 'playing' | 'paused' | 'buffering' | 'idle' | 'unknown';
  idleReason: 'finished' | 'canceled' | 'interrupted' | 'error' | 'none';
  positionMs: number;
  durationMs: number;
  contentId: string;
  volume: number;
  muted: boolean;
}

export interface SpeakerLoadOptions {
  url: string;
  contentType?: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  startTimeMs?: number;
  isLive?: boolean;
  autoplay?: boolean;
}

interface PlajahSpeakersShape {
  isSupported(): Promise<{ supported: boolean; reason?: string }>;
  startDiscovery(): Promise<{ routes: SpeakerRoute[] }>;
  stopDiscovery(): Promise<void>;
  listRoutes(): Promise<{ routes: SpeakerRoute[] }>;
  getState(): Promise<SpeakerSession>;
  selectRoute(opts: { id: string }): Promise<{ id: string; name: string }>;
  deselect(): Promise<void>;
  loadMedia(opts: SpeakerLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(opts: { positionMs: number }): Promise<void>;
  setVolume(opts: { level: number; id?: string }): Promise<{ level: number }>;
  addListener(event: 'routesChanged', cb: (e: { routes: SpeakerRoute[] }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'sessionChanged', cb: (e: SpeakerSession) => void): Promise<PluginListenerHandle>;
  addListener(event: 'mediaStatus', cb: (e: SpeakerMediaStatus) => void): Promise<PluginListenerHandle>;
}

export const PlajahSpeakers = registerPlugin<PlajahSpeakersShape>('PlajahSpeakers');

/** Synchronous gate: the native Android shell is the only place the plugin can exist. */
export function isSpeakerPickerSupported(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
      && Capacitor.isPluginAvailable('PlajahSpeakers');
  } catch { return false; }
}

let supportedPromise: Promise<boolean> | null = null;
/** Async gate: false only if the native plugin itself is unavailable. Cached. */
export function speakersAvailable(): Promise<boolean> {
  if (!isSpeakerPickerSupported()) return Promise.resolve(false);
  if (!supportedPromise) {
    supportedPromise = PlajahSpeakers.isSupported().then(r => !!r.supported).catch(() => false);
  }
  return supportedPromise;
}

async function guard<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!(await speakersAvailable())) return fallback;
  try { return await fn(); } catch (e) { console.warn('[speakers]', e); return fallback; }
}

export const speakers = {
  startDiscovery: () => guard(async () => (await PlajahSpeakers.startDiscovery()).routes, [] as SpeakerRoute[]),
  stopDiscovery: () => guard(() => PlajahSpeakers.stopDiscovery(), undefined),
  listRoutes: () => guard(async () => (await PlajahSpeakers.listRoutes()).routes, [] as SpeakerRoute[]),
  getState: () => guard<SpeakerSession | null>(() => PlajahSpeakers.getState(), null),
  selectRoute: (id: string) => guard(async () => { await PlajahSpeakers.selectRoute({ id }); return true; }, false),
  deselect: () => guard(() => PlajahSpeakers.deselect(), undefined),
  loadMedia: (opts: SpeakerLoadOptions) => guard(async () => { await PlajahSpeakers.loadMedia(opts); return true; }, false),
  play: () => guard(() => PlajahSpeakers.play(), undefined),
  pause: () => guard(() => PlajahSpeakers.pause(), undefined),
  stop: () => guard(() => PlajahSpeakers.stop(), undefined),
  seek: (positionMs: number) => guard(() => PlajahSpeakers.seek({ positionMs }), undefined),
  setVolume: (level: number, id?: string) =>
    guard(async () => { await PlajahSpeakers.setVolume(id ? { level, id } : { level }); return true; }, false),
};

type Off = () => void;
function listen(event: 'routesChanged' | 'sessionChanged' | 'mediaStatus', cb: (e: any) => void): Off {
  let handle: PluginListenerHandle | null = null;
  let dead = false;
  speakersAvailable().then(ok => {
    if (!ok || dead) return;
    (PlajahSpeakers.addListener as any)(event, cb).then((h: PluginListenerHandle) => {
      if (dead) h.remove(); else handle = h;
    }).catch(() => {});
  });
  return () => { dead = true; handle?.remove(); };
}

export const onRoutesChanged = (cb: (routes: SpeakerRoute[]) => void): Off => listen('routesChanged', e => cb(e?.routes || []));
export const onSessionChanged = (cb: (s: SpeakerSession) => void): Off => listen('sessionChanged', cb);
export const onMediaStatus = (cb: (m: SpeakerMediaStatus) => void): Off => listen('mediaStatus', cb);

export interface UseSpeakerGroups {
  supported: boolean;
  routes: SpeakerRoute[];
  groups: SpeakerRoute[];
  devices: SpeakerRoute[];
  session: SpeakerSession | null;
  media: SpeakerMediaStatus | null;
  /** The selected cast route, or null when playing on this device. */
  active: SpeakerRoute | null;
  select: (id: string) => Promise<boolean>;
  playHere: () => Promise<void>;
  setVolume: (level: number, id?: string) => Promise<boolean>;
}

/**
 * Live speaker list + session. `discover` = true runs an active scan while the caller is mounted
 * (pass the picker's `open` flag so scanning stops when it closes).
 */
export function useSpeakerGroups(discover = false): UseSpeakerGroups {
  const [supported, setSupported] = useState(false);
  const [routes, setRoutes] = useState<SpeakerRoute[]>([]);
  const [session, setSession] = useState<SpeakerSession | null>(null);
  const [media, setMedia] = useState<SpeakerMediaStatus | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    speakersAvailable().then(ok => {
      if (!alive.current) return;
      setSupported(ok);
      if (!ok) return;
      speakers.listRoutes().then(r => { if (alive.current) setRoutes(r); });
      speakers.getState().then(s => {
        if (!alive.current || !s) return;
        setSession(s);
        if (s.media) setMedia(s.media);
      });
    });
    const offs = [
      onRoutesChanged(r => alive.current && setRoutes(r)),
      onSessionChanged(s => {
        if (!alive.current) return;
        setSession(s);
        if (s.state === 'ended' || s.state === 'failed') setMedia(null);
      }),
      onMediaStatus(m => alive.current && setMedia(m)),
    ];
    return () => { alive.current = false; offs.forEach(o => o()); };
  }, []);

  useEffect(() => {
    if (!discover) return;
    let on = true;
    speakers.startDiscovery().then(r => { if (on && r.length) setRoutes(r); });
    return () => { on = false; speakers.stopDiscovery(); };
  }, [discover]);

  const select = useCallback((id: string) => speakers.selectRoute(id), []);
  const playHere = useCallback(() => speakers.deselect(), []);
  const setVolume = useCallback((level: number, id?: string) => speakers.setVolume(level, id), []);

  const groups = routes.filter(r => r.isGroup);
  const devices = routes.filter(r => !r.isGroup);
  const active = routes.find(r => r.isSelected) || null;
  return { supported, routes, groups, devices, session, media, active, select, playHere, setVolume };
}
