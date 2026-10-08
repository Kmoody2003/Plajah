/**
 * Data for the TV ambient layer (components/tv/ambient/*).
 *
 * The pillar and the full-screen view read the SAME stores, so opening one while the other is up
 * never doubles a fetch. Each polled store is ref-counted: it starts polling when the first
 * subscriber arrives and stops when the last one leaves, so nothing runs while ambient is hidden.
 *
 * What is real here, and what is deliberately absent:
 *  · Weather   — Open-Meteo (no key), at the location the user's OWN profile already saved
 *                (users/{uid}.weatherLat / weatherLon / weatherCity, written by ProfileSmartCard).
 *                No saved location → status 'no-location'. We never guess a location.
 *  · Notes     — services/notesService.loadNotes (the user's notebook: Firestore + this device).
 *  · Alerts    — contexts/NotificationContext (the app's existing live `notifications` listener;
 *                reading it adds no subscription).
 *  · Lights / thermostat / cameras — the Plajah Home hub running on the user's PC
 *                (services/home/plajahHubClient → routes/homeHubRoutes.ts): Matter devices on the hub's
 *                own fabric, the Hue bridge (local API) and RTSP cameras. One shared hub-state store,
 *                polled every 30s while a tile is visible. No hub found → status 'unlinked'; the
 *                tiles show "Connect the Plajah Home hub". (plajahHomeService / matterCameraService
 *                MOCK_* fixtures are NOT used.)
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { loadNotes } from '../notesService';
import { useNotifications } from '../../contexts/NotificationContext';
import type { AppNotification } from '../../types';
import {
  getHubState, sendHubCommand, fetchCameraSnapshot, releaseSnapshotUrl, onHubConfigChange, HubError,
  type HubState, type HubDevice,
} from '../home/plajahHubClient';

// ─── Ref-counted polled store ─────────────────────────────────────────────────

interface PolledStore<T> {
  get: () => T;
  subscribe: (fn: () => void) => () => void;
  refresh: () => Promise<void>;
}

function createPolledStore<T>(initial: T, load: () => Promise<T>, intervalMs: number): PolledStore<T> {
  let value = initial;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inflight: Promise<void> | null = null;
  const subs = new Set<() => void>();

  const run = (): Promise<void> => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        value = await load();
        subs.forEach(fn => fn());
      } catch { /* keep the last good value */ }
      finally { inflight = null; }
    })();
    return inflight;
  };

  return {
    get: () => value,
    refresh: run,
    subscribe(fn) {
      subs.add(fn);
      if (subs.size === 1) { void run(); timer = setInterval(run, intervalMs); }
      return () => {
        subs.delete(fn);
        if (subs.size === 0 && timer) { clearInterval(timer); timer = undefined; }
      };
    },
  };
}

const noopSubscribe = () => () => {};

/** Read a polled store; subscribes (and therefore polls) only while `active`. */
function usePolled<T>(store: PolledStore<T>, active: boolean): T {
  const subscribe = useCallback((fn: () => void) => (active ? store.subscribe(fn) : noopSubscribe()), [store, active]);
  return useSyncExternalStore(subscribe, store.get, store.get);
}

async function currentUid(): Promise<string | null> {
  try { await (auth as any).authStateReady?.(); } catch { /* older SDK */ }
  return auth.currentUser?.uid ?? null;
}

// ─── Clock ────────────────────────────────────────────────────────────────────

/** Current time, re-rendering once per minute exactly on the minute boundary. */
export function useMinuteClock(active = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    let interval: ReturnType<typeof setInterval> | undefined;
    const msToNext = 60_000 - (Date.now() % 60_000) + 50;
    const first = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNext);
    return () => { clearTimeout(first); if (interval) clearInterval(interval); };
  }, [active]);
  return now;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtDate = (d: Date) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

export function relTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); return `${d}d ago`;
}

// ─── Weather (Open-Meteo, profile location only) ──────────────────────────────

export interface AmbientHour { label: string; temp: number; code: number; pop: number | null }
export interface AmbientWeather {
  status: 'loading' | 'no-location' | 'ok' | 'error';
  city?: string;
  temp?: number;
  code?: number;
  isDay?: boolean;
  hi?: number;
  lo?: number;
  unit: 'F' | 'C';
  hours: AmbientHour[];
}

const usesFahrenheit = (): boolean => {
  try {
    const region = (navigator.language || '').split('-')[1]?.toUpperCase();
    return region === 'US' || region === 'LR' || region === 'MM';
  } catch { return false; }
};

async function loadWeather(): Promise<AmbientWeather> {
  const unit: 'F' | 'C' = usesFahrenheit() ? 'F' : 'C';
  const uid = await currentUid();
  if (!uid) return { status: 'no-location', unit, hours: [] };
  const snap = await getDoc(doc(db, 'users', uid));
  const p = (snap.exists() ? snap.data() : {}) as { weatherLat?: number; weatherLon?: number; weatherCity?: string };
  if (typeof p.weatherLat !== 'number' || typeof p.weatherLon !== 'number') return { status: 'no-location', unit, hours: [] };

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${p.weatherLat.toFixed(3)}&longitude=${p.weatherLon.toFixed(3)}`
    + '&current=temperature_2m,weather_code,is_day'
    + '&hourly=temperature_2m,weather_code,precipitation_probability'
    + '&daily=temperature_2m_max,temperature_2m_min'
    + '&forecast_days=2&timezone=auto'
    + (unit === 'F' ? '&temperature_unit=fahrenheit' : '');
  const res = await fetch(url);
  if (!res.ok) return { status: 'error', unit, hours: [], city: p.weatherCity };
  const w = await res.json();

  const curTime: string = w.current?.time || '';
  const curHour = curTime.slice(0, 13);   // "2026-10-08T14"
  const times: string[] = w.hourly?.time || [];
  const hours: AmbientHour[] = [];
  for (let i = 0; i < times.length && hours.length < 6; i++) {
    if (times[i].slice(0, 13) <= curHour) continue;
    const hh = Number(times[i].slice(11, 13));
    const label = new Date(2000, 0, 1, hh).toLocaleTimeString([], { hour: 'numeric' });
    const pop = w.hourly?.precipitation_probability?.[i];
    hours.push({ label, temp: Math.round(w.hourly.temperature_2m[i]), code: w.hourly.weather_code[i] ?? 0, pop: typeof pop === 'number' ? pop : null });
  }
  return {
    status: 'ok',
    city: p.weatherCity,
    temp: Math.round(w.current?.temperature_2m ?? 0),
    code: w.current?.weather_code ?? 0,
    isDay: (w.current?.is_day ?? 1) === 1,
    hi: typeof w.daily?.temperature_2m_max?.[0] === 'number' ? Math.round(w.daily.temperature_2m_max[0]) : undefined,
    lo: typeof w.daily?.temperature_2m_min?.[0] === 'number' ? Math.round(w.daily.temperature_2m_min[0]) : undefined,
    unit,
    hours,
  };
}

const weatherStore = createPolledStore<AmbientWeather>({ status: 'loading', unit: 'F', hours: [] }, loadWeather, 20 * 60_000);
export const useAmbientWeather = (active: boolean) => usePolled(weatherStore, active);

/** WMO weather code → short label + an icon key the components map to lucide icons. */
export type WeatherIconKey = 'sun' | 'moon' | 'partly-day' | 'partly-night' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export function describeWeather(code: number, isDay = true): { label: string; icon: WeatherIconKey } {
  if (code === 0) return { label: 'Clear', icon: isDay ? 'sun' : 'moon' };
  if (code === 1 || code === 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? 'partly-day' : 'partly-night' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: 'snow' };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'storm' };
  return { label: 'Cloudy', icon: 'cloud' };
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export interface AmbientNote { id: string; title: string; snippet: string; updatedAt: number }

async function loadRecentNotes(): Promise<AmbientNote[]> {
  const uid = await currentUid();
  const s = await loadNotes(uid ?? undefined);
  return s.pages
    .filter(p => (p.title || p.text || '').trim())
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8)
    .map(p => ({
      id: p.id,
      title: (p.title || '').trim() || 'Untitled note',
      snippet: (p.text || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      updatedAt: p.updatedAt || 0,
    }));
}

const notesStore = createPolledStore<AmbientNote[] | null>(null, loadRecentNotes, 5 * 60_000);
/** null while the first load is in flight; [] when the user genuinely has no notes. */
export const useAmbientNotes = (active: boolean) => usePolled(notesStore, active);

// ─── Notifications (existing app-wide listener) ───────────────────────────────

export interface AmbientNotifications {
  available: boolean;
  items: AppNotification[];
  unread: number;
  markAsRead: (id: string) => void;
}

/** Reads NotificationContext. Outside its provider it reports `available: false` instead of throwing. */
export function useAmbientNotifications(): AmbientNotifications {
  let ctx: ReturnType<typeof useNotifications> | null = null;
  try { ctx = useNotifications(); } catch { ctx = null; }   // useContext is still called on both paths
  const items = ctx ? [...ctx.notifications].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : [];
  const mark = ctx?.markAsRead;
  return {
    available: !!ctx,
    items,
    unread: ctx?.unreadCount ?? 0,
    markAsRead: (id: string) => { mark?.(id).catch(() => {}); },
  };
}

// ─── Plajah Home hub (lights, thermostat, cameras) ────────────────────────────

interface HubSnapshot { status: 'loading' | 'unlinked' | 'ok' | 'error'; state?: HubState; error?: string }

const hubErrorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let lastHub: HubSnapshot = { status: 'loading' };
async function loadHub(): Promise<HubSnapshot> {
  try {
    const state = await getHubState();
    lastHub = { status: 'ok', state };
  } catch (e) {
    const notFound = e instanceof HubError && e.kind === 'not-found';
    // A hub that answered before keeps its last reading (with the error) through a blip.
    lastHub = lastHub.status === 'ok' && lastHub.state
      ? { status: 'ok', state: lastHub.state, error: hubErrorMessage(e) }
      : { status: notFound ? 'unlinked' : 'error', error: hubErrorMessage(e) };
  }
  return lastHub;
}

const hubStore = createPolledStore<HubSnapshot>({ status: 'loading' }, loadHub, 30_000);
// Saving a hub address / token on THIS device refreshes the tiles at once.
onHubConfigChange(() => { void hubStore.refresh(); });

const useHub = (active: boolean) => usePolled(hubStore, active);

/** After a command: re-read the hub so the tiles show what the device now reports. */
function afterCommand() { void hubStore.refresh(); }

// ─── Lights ───────────────────────────────────────────────────────────────────

export interface AmbientLight { id: string; name: string; room?: string; on: boolean; platform: 'hue' | 'matter' }

/** Lights the hub can actually switch (Hue bridge + Matter lights on the hub's own fabric). */
export function useAmbientLights(active: boolean) {
  const hub = useHub(active);
  const lights: AmbientLight[] = (hub.state?.devices || [])
    .filter(d => d.kind === 'light' && d.online && typeof d.state.on === 'boolean' && (d.source === 'hue' || d.source === 'matter'))
    .map(d => ({ id: d.id, name: d.name, room: d.room, on: !!d.state.on, platform: d.source as 'hue' | 'matter' }))
    .sort((a, b) => (a.room || '~').localeCompare(b.room || '~') || a.name.localeCompare(b.name));
  const anyConnected = hub.status === 'ok';
  const toggle = useCallback((id: string) => {
    sendHubCommand(id, 'toggle').then(afterCommand, () => {});
  }, []);
  return { lights, colorOnly: 0, anyConnected, hubStatus: hub.status, toggle };
}

// ─── Thermostat + cameras ─────────────────────────────────────────────────────

export type HvacMode = 'off' | 'heat' | 'cool' | 'auto' | string;

/** Thermostat reading in the viewer's unit (°F in the US, °C elsewhere). */
export interface AmbientClimate {
  entityId: string;
  name: string;
  /** off / heat / cool / auto, or 'unavailable' when the hub cannot reach the device */
  hvacMode: HvacMode;
  hvacModes: HvacMode[];
  /** heating / cooling / fan / idle (null when the device does not report it) */
  hvacAction: string | null;
  currentTemperature: number | null;
  /** Single setpoint. null in auto (dual setpoint) mode. */
  targetTemperature: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  step: number;
  unit: '°F' | '°C';
}

export interface AmbientCamera {
  /** hub device id, e.g. camera:ab12cd34ef */
  entityId: string;
  name: string;
  state: string;
  available: boolean;
}

const toUnit = (c: number | null | undefined, f: boolean): number | null =>
  c == null ? null : f ? Math.round((c * 9) / 5 + 32) : Math.round(c * 2) / 2;
const fromUnit = (v: number, f: boolean): number => (f ? ((v - 32) * 5) / 9 : v);

function climateOf(d: HubDevice): AmbientClimate {
  const f = usesFahrenheit();
  const s = d.state;
  const mode = d.online ? (s.mode || 'unknown') : 'unavailable';
  const heat = toUnit(s.heatSetpointC, f);
  const cool = toUnit(s.coolSetpointC, f);
  const dual = mode === 'auto' && heat != null && cool != null;
  return {
    entityId: d.id,
    name: d.name,
    hvacMode: mode,
    hvacModes: s.modes || [],
    hvacAction: s.action ?? null,
    currentTemperature: toUnit(s.temperatureC, f),
    targetTemperature: dual ? null : mode === 'cool' ? cool : (heat ?? cool),
    targetLow: dual ? heat : null,
    targetHigh: dual ? cool : null,
    minTemp: toUnit(s.minC, f),
    maxTemp: toUnit(s.maxC, f),
    step: f ? 1 : 0.5,
    unit: f ? '°F' : '°C',
  };
}

export interface AmbientThermostat {
  status: 'loading' | 'unlinked' | 'none' | 'ok' | 'error';
  climate?: AmbientClimate;
  /** Set when the last poll failed; with status 'ok', `climate` is then the last good reading. */
  error?: string;
}

function thermostatFrom(h: HubSnapshot): AmbientThermostat {
  if (h.status !== 'ok' || !h.state) return { status: h.status, error: h.error };
  const d = h.state.devices.find(x => x.kind === 'thermostat');
  return d ? { status: 'ok', climate: climateOf(d), error: h.error } : { status: 'none', error: h.error };
}

export interface AmbientCameras { status: 'loading' | 'unlinked' | 'none' | 'ok' | 'error'; cameras: AmbientCamera[]; error?: string }

function camerasFrom(h: HubSnapshot): AmbientCameras {
  if (h.status !== 'ok' || !h.state) return { status: h.status, cameras: [], error: h.error };
  const all = h.state.devices.filter(d => d.kind === 'camera').map(d => ({
    entityId: d.id, name: d.name, state: d.state.available === false ? 'unavailable' : 'idle', available: d.online,
  }));
  // Reachable cameras first; the rest still show so the tile can say they are offline.
  const cams = [...all.filter(c => c.available), ...all.filter(c => !c.available)].slice(0, 2);
  return cams.length ? { status: 'ok', cameras: cams } : { status: 'none', cameras: [] };
}

const HVAC_CYCLE = ['heat', 'cool', 'off'] as const;
const SETPOINT_DEBOUNCE_MS = 800;

/**
 * The hub's first thermostat, refreshed with the hub state (30s) while `active`.
 * nudge(+1 / -1) moves a local pending setpoint and sends it about 800ms after the last press.
 * cycleMode() steps heat, cool, off (only the modes the device supports).
 */
export function useAmbientThermostat(active: boolean) {
  const t = thermostatFrom(useHub(active));
  const climate = t.status === 'ok' ? t.climate : undefined;
  const climateRef = useRef(climate); climateRef.current = climate;

  const [pending, setPending] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entityRef = useRef<string | null>(null);

  const commit = useCallback(async () => {
    timerRef.current = undefined;
    const v = pendingRef.current;
    const entity = entityRef.current;
    if (v == null || !entity) return;
    try {
      await sendHubCommand(entity, 'setpoint', Math.round(fromUnit(v, usesFahrenheit()) * 10) / 10);
      setControlError(null);
      await hubStore.refresh();
    } catch (e) {
      setControlError(hubErrorMessage(e));
    } finally {
      if (pendingRef.current === v) { pendingRef.current = null; setPending(null); }
    }
  }, []);

  const nudge = useCallback((delta: number): boolean => {
    const c = climateRef.current;
    if (!c || c.targetTemperature == null || c.hvacMode === 'unavailable' || c.hvacMode === 'off') return false;
    const base = pendingRef.current ?? c.targetTemperature;
    let next = Math.round((base + delta) * 2) / 2;
    if (c.minTemp != null) next = Math.max(c.minTemp, next);
    if (c.maxTemp != null) next = Math.min(c.maxTemp, next);
    entityRef.current = c.entityId;
    pendingRef.current = next;
    setPending(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void commit(); }, SETPOINT_DEBOUNCE_MS);
    return true;
  }, [commit]);

  const cycleMode = useCallback(async () => {
    const c = climateRef.current;
    if (!c || c.hvacMode === 'unavailable' || c.hvacMode === 'unknown') return;
    const modes = HVAC_CYCLE.filter(m => c.hvacModes.length === 0 || c.hvacModes.includes(m));
    if (!modes.length) return;
    const cur = (modes as readonly string[]).indexOf(c.hvacMode);
    const next = modes[(cur + 1) % modes.length];
    setPendingMode(next);
    try {
      await sendHubCommand(c.entityId, 'mode', next);
      setControlError(null);
      await hubStore.refresh();
    } catch (e) {
      setControlError(hubErrorMessage(e));
    } finally {
      setPendingMode(null);
    }
  }, []);

  // Closing the dash while a setpoint is still debouncing sends it now instead of dropping it.
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); void commit(); }
  }, [commit]);

  return { ...t, climate, pendingTarget: pending, pendingMode, controlError, nudge, cycleMode };
}

/** Up to two hub cameras (reachable ones first). */
export const useAmbientCameras = (active: boolean): AmbientCameras => camerasFrom(useHub(active));

/**
 * A camera snapshot from the hub as an image URL, refetched every `intervalMs` while `active` and
 * the page is visible. A replaced blob: URL is revoked shortly after the swap; the current one on
 * unmount or camera change. Fetches never overlap: the next one is scheduled after the previous one.
 */
export function useCameraSnapshot(entityId: string | null | undefined, intervalMs: number, active: boolean) {
  const [snap, setSnap] = useState<{ url: string | null; error: string | null; at: number }>({ url: null, error: null, at: 0 });
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!entityId || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => { if (!cancelled) timer = setTimeout(() => { void tick(); }, intervalMs); };
    let running = false;
    const tick = async (): Promise<void> => {
      if (running) return;
      if (typeof document !== 'undefined' && document.hidden) { schedule(); return; }
      running = true;
      try {
        const url = await fetchCameraSnapshot(entityId);
        if (cancelled) { releaseSnapshotUrl(url); return; }
        const old = urlRef.current;
        urlRef.current = url;
        setSnap({ url, error: null, at: Date.now() });
        if (old) setTimeout(() => releaseSnapshotUrl(old), 1_000);
      } catch (e) {
        if (!cancelled) setSnap(s => ({ ...s, error: hubErrorMessage(e) }));
      } finally {
        running = false;
      }
      schedule();
    };
    const onVisible = () => {
      if (!document.hidden && !cancelled) { if (timer) clearTimeout(timer); void tick(); }
    };
    void tick();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      const cur = urlRef.current;
      urlRef.current = null;
      releaseSnapshotUrl(cur);
      setSnap({ url: null, error: null, at: 0 });
    };
  }, [entityId, intervalMs, active]);

  return snap;
}

export const fmtSetpoint = (v: number | null | undefined): string =>
  v == null ? '--' : (Number.isInteger(v) ? String(v) : v.toFixed(1));

