/**
 * Home Assistant — the real smart-home hub behind the TV ambient dash's thermostat and camera tiles.
 *
 * Home Assistant bridges Nest / Ecobee / Honeywell thermostats, Ring / UniFi / Reolink cameras and
 * Matter devices behind one REST API, so Plajah talks to HA instead of to each vendor.
 *
 * Config — { baseUrl, token } — lives in Firestore at users/{uid}/private/homeAssistant (owner-only
 * rule: firestore.rules `users/{userId}/private/{docId}`). The long-lived access token is therefore
 * readable by the owner's own signed-in clients (phone, desktop, TV). It never goes in a URL.
 *
 * Transport:
 *  · Native (Capacitor APK)  → CapacitorHttp.request (native HttpURLConnection / URLSession). No CORS,
 *    and not subject to the WebView's mixed-content block, so a LAN address can work from the
 *    https://plajah.com page. NOTE: the Android APK targets SDK 36 with no network security config,
 *    so Android itself still refuses cleartext http:// until the APK permits it — we report that
 *    error plainly (see describeError).
 *  · Web                     → fetch. Only an https:// HA URL can work (an https page cannot call
 *    http://), and HA must list the Plajah origin under `http: cors_allowed_origins`.
 *
 * REST endpoints used: GET /api/, /api/config, /api/states; POST /api/services/climate/*;
 * GET /api/camera_proxy/{entity_id} (JPEG snapshot).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HaConfig { baseUrl: string; token: string }

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export type HvacMode = 'off' | 'heat' | 'cool' | 'heat_cool' | 'auto' | 'dry' | 'fan_only' | string;

export interface HaClimate {
  entityId: string;
  name: string;
  /** hvac_mode (the entity's state). 'unavailable' / 'unknown' when HA cannot reach the device. */
  hvacMode: HvacMode;
  hvacModes: HvacMode[];
  /** hvac_action: heating / cooling / idle / off … (null when the integration does not report it). */
  hvacAction: string | null;
  currentTemperature: number | null;
  /** Single setpoint. null in heat_cool (dual setpoint) mode. */
  targetTemperature: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  step: number;
  /** '°F' or '°C' — HA's configured unit system (climate attributes are in that unit). */
  unit: string;
}

export interface HaCamera {
  entityId: string;
  name: string;
  /** idle / streaming / recording / unavailable … */
  state: string;
  available: boolean;
}

export class HaError extends Error {
  constructor(message: string, readonly kind: 'config' | 'auth' | 'network' | 'timeout' | 'http' | 'cleartext' | 'mixed-content' | 'cors', readonly status?: number) {
    super(message);
    this.name = 'HaError';
  }
}

// ─── URL / platform helpers ───────────────────────────────────────────────────

export const isNativeTransport = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** Trim, require a scheme, drop trailing slashes and a trailing /api. Throws HaError('config'). */
export function normalizeBaseUrl(raw: string): string {
  let s = (raw || '').trim();
  if (!s) throw new HaError('Enter your Home Assistant URL.', 'config');
  if (!/^https?:\/\//i.test(s)) throw new HaError('Include http:// or https:// in the Home Assistant URL (for example http://192.168.1.20:8123).', 'config');
  s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
  try {
    const u = new URL(s);
    if (u.search || u.hash) throw new Error();
  } catch {
    throw new HaError('That does not look like a valid URL.', 'config');
  }
  return s;
}

const JSON_TIMEOUT_MS = 10_000;
const SNAPSHOT_TIMEOUT_MS = 12_000;

function describeError(e: unknown, cfg: HaConfig, native: boolean): HaError {
  if (e instanceof HaError) return e;
  const msg = String((e as any)?.message ?? e ?? '');
  if (/cleartext/i.test(msg)) {
    return new HaError(
      'This device blocks plain http:// connections. Use an https:// Home Assistant URL (for example your Nabu Casa remote URL), or an app build that allows local http.',
      'cleartext',
    );
  }
  if (/timed? ?out|timeout|SocketTimeout/i.test(msg)) {
    return new HaError(`Home Assistant at ${cfg.baseUrl} did not answer in time. Check that it is on and reachable from this device's network.`, 'timeout');
  }
  if (!native && (e as any)?.name === 'TypeError') {
    // fetch() reports CORS rejections and unreachable hosts identically.
    return new HaError(
      `Could not reach ${cfg.baseUrl} from this browser. Check the address, and add this site (${location.origin}) to "http: cors_allowed_origins" in Home Assistant's configuration.yaml.`,
      'cors',
    );
  }
  return new HaError(`Could not reach Home Assistant at ${cfg.baseUrl}${msg ? ` (${msg})` : ''}.`, 'network');
}

function httpError(status: number, path: string, body: unknown): HaError {
  if (status === 401 || status === 403) {
    return new HaError('Home Assistant rejected the access token. Create a new long-lived access token (Profile → Security in Home Assistant) and paste it again.', 'auth', status);
  }
  if (status === 404) return new HaError(`Home Assistant has no ${path.startsWith('/api/camera_proxy') ? 'such camera' : `endpoint ${path}`} (404).`, 'http', status);
  const detail = typeof body === 'string' ? body.slice(0, 160) : (body as any)?.message ? String((body as any).message).slice(0, 160) : '';
  return new HaError(`Home Assistant returned ${status}${detail ? `: ${detail}` : ''}.`, 'http', status);
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const k = Object.keys(headers).find(h => h.toLowerCase() === name.toLowerCase());
  return k ? headers[k] : undefined;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// ─── Core request ─────────────────────────────────────────────────────────────

async function haRequest(cfg: HaConfig, method: 'GET' | 'POST', path: string, opts: { body?: unknown; blob?: false; timeoutMs?: number }): Promise<any>;
async function haRequest(cfg: HaConfig, method: 'GET' | 'POST', path: string, opts: { body?: unknown; blob: true; timeoutMs?: number }): Promise<Blob>;
async function haRequest(cfg: HaConfig, method: 'GET' | 'POST', path: string, opts: { body?: unknown; blob?: boolean; timeoutMs?: number }): Promise<any> {
  const base = normalizeBaseUrl(cfg.baseUrl);
  if (!cfg.token?.trim()) throw new HaError('Paste a Home Assistant long-lived access token.', 'config');
  const url = base + path;
  const native = isNativeTransport();
  const timeoutMs = opts.timeoutMs ?? (opts.blob ? SNAPSHOT_TIMEOUT_MS : JSON_TIMEOUT_MS);
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.token.trim()}` };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!opts.blob) headers.Accept = 'application/json';

  if (native) {
    let res;
    try {
      res = await withTimeout(CapacitorHttp.request({
        url, method, headers,
        data: opts.body,
        responseType: opts.blob ? 'blob' : 'json',
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      }), timeoutMs + 1_000);
    } catch (e) { throw describeError(e, { ...cfg, baseUrl: base }, true); }
    if (res.status < 200 || res.status >= 300) throw httpError(res.status, path, res.data);
    if (opts.blob) {
      const type = (headerValue(res.headers, 'Content-Type') || 'image/jpeg').split(';')[0].trim();
      if (typeof res.data !== 'string' || !res.data) throw new HaError('Home Assistant sent an empty camera image.', 'http', res.status);
      return base64ToBlob(res.data, type);
    }
    if (typeof res.data === 'string') {
      try { return res.data ? JSON.parse(res.data) : null; } catch { return res.data; }
    }
    return res.data;
  }

  // Web
  if (typeof location !== 'undefined' && location.protocol === 'https:' && base.startsWith('http://')) {
    throw new HaError(
      'This browser page is https, so it cannot call an http:// Home Assistant address. Use an https:// URL (for example your Nabu Casa remote URL), or link from the Plajah TV / Android app.',
      'mixed-content',
    );
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method, headers, signal: ctrl.signal, cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as any)?.name === 'AbortError') throw describeError(new Error('timeout'), { ...cfg, baseUrl: base }, false);
    throw describeError(e, { ...cfg, baseUrl: base }, false);
  }
  try {
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.text(); } catch { /* ignore */ }
      throw httpError(res.status, path, body);
    }
    if (opts.blob) return await res.blob();
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw describeError(new Error('timeout'), { ...cfg, baseUrl: base }, false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Config (Firestore users/{uid}/private/homeAssistant) ─────────────────────

const CONFIG_TTL_MS = 2 * 60_000;
let cache: { uid: string; cfg: HaConfig | null; at: number } | null = null;
const listeners = new Set<() => void>();

/** Called when this client saves or removes the link, so live views can refetch immediately. */
export function onHaConfigChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emitChange = () => listeners.forEach(fn => { try { fn(); } catch { /* listener bug */ } });

async function currentUid(): Promise<string | null> {
  try { await (auth as any).authStateReady?.(); } catch { /* older SDK */ }
  return auth.currentUser?.uid ?? null;
}

const configRef = (uid: string) => doc(db, 'users', uid, 'private', 'homeAssistant');

/** The signed-in user's saved link, or null. Cached for a couple of minutes. */
export async function loadHaConfig(force = false): Promise<HaConfig | null> {
  const uid = await currentUid();
  if (!uid) return null;
  if (!force && cache && cache.uid === uid && Date.now() - cache.at < CONFIG_TTL_MS) return cache.cfg;
  const snap = await getDoc(configRef(uid));
  const d = snap.exists() ? (snap.data() as Partial<HaConfig>) : null;
  const cfg = d && typeof d.baseUrl === 'string' && typeof d.token === 'string' && d.baseUrl && d.token
    ? { baseUrl: d.baseUrl, token: d.token } : null;
  cache = { uid, cfg, at: Date.now() };
  return cfg;
}

export async function saveHaConfig(input: HaConfig): Promise<HaConfig> {
  const uid = await currentUid();
  if (!uid) throw new HaError('Sign in to Plajah first.', 'config');
  const cfg: HaConfig = { baseUrl: normalizeBaseUrl(input.baseUrl), token: (input.token || '').trim() };
  if (!cfg.token) throw new HaError('Paste a Home Assistant long-lived access token.', 'config');
  await setDoc(configRef(uid), { baseUrl: cfg.baseUrl, token: cfg.token, updatedAt: Date.now() });
  cache = { uid, cfg, at: Date.now() };
  emitChange();
  return cfg;
}

export async function clearHaConfig(): Promise<void> {
  const uid = await currentUid();
  if (!uid) return;
  await deleteDoc(configRef(uid));
  cache = { uid, cfg: null, at: Date.now() };
  emitChange();
}

async function requireConfig(cfg?: HaConfig | null): Promise<HaConfig> {
  const c = cfg ?? await loadHaConfig();
  if (!c) throw new HaError('Home Assistant is not linked.', 'config');
  return c;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const unitCache = new Map<string, string>();

async function temperatureUnit(cfg: HaConfig): Promise<string> {
  const key = normalizeBaseUrl(cfg.baseUrl);
  const hit = unitCache.get(key);
  if (hit) return hit;
  const conf = await haRequest(cfg, 'GET', '/api/config', {});
  const unit = typeof conf?.unit_system?.temperature === 'string' ? conf.unit_system.temperature : '°C';
  unitCache.set(key, unit);
  return unit;
}

export async function getStates(cfg?: HaConfig | null): Promise<HaState[]> {
  const c = await requireConfig(cfg);
  const data = await haRequest(c, 'GET', '/api/states', {});
  if (!Array.isArray(data)) throw new HaError('Home Assistant sent an unexpected /api/states response.', 'http');
  return data as HaState[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const nameOf = (s: HaState) => String(s.attributes?.friendly_name || s.entity_id);

function toClimate(s: HaState, unit: string): HaClimate {
  const a = s.attributes || {};
  return {
    entityId: s.entity_id,
    name: nameOf(s),
    hvacMode: s.state,
    hvacModes: Array.isArray(a.hvac_modes) ? a.hvac_modes.map(String) : [],
    hvacAction: typeof a.hvac_action === 'string' ? a.hvac_action : null,
    currentTemperature: num(a.current_temperature),
    targetTemperature: num(a.temperature),
    targetLow: num(a.target_temp_low),
    targetHigh: num(a.target_temp_high),
    minTemp: num(a.min_temp),
    maxTemp: num(a.max_temp),
    step: num(a.target_temp_step) ?? (unit.includes('F') ? 1 : 0.5),
    unit,
  };
}

function toCamera(s: HaState): HaCamera {
  return { entityId: s.entity_id, name: nameOf(s), state: s.state, available: s.state !== 'unavailable' && s.state !== 'unknown' };
}

/** All climate.* entities. Pass `states` to reuse one /api/states call. */
export async function climateEntities(cfg?: HaConfig | null, states?: HaState[]): Promise<HaClimate[]> {
  const c = await requireConfig(cfg);
  const [all, unit] = await Promise.all([states ? Promise.resolve(states) : getStates(c), temperatureUnit(c)]);
  return all.filter(s => s.entity_id.startsWith('climate.')).map(s => toClimate(s, unit));
}

/** All camera.* entities. Pass `states` to reuse one /api/states call. */
export async function cameraEntities(cfg?: HaConfig | null, states?: HaState[]): Promise<HaCamera[]> {
  const c = await requireConfig(cfg);
  const all = states ?? await getStates(c);
  return all.filter(s => s.entity_id.startsWith('camera.')).map(toCamera);
}

const assertEntity = (entityId: string, domain: string) => {
  if (!new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(entityId)) throw new HaError(`Not a ${domain} entity: ${entityId}`, 'config');
};

export async function setTemperature(entityId: string, temperature: number, cfg?: HaConfig | null): Promise<void> {
  assertEntity(entityId, 'climate');
  if (!Number.isFinite(temperature)) throw new HaError('Invalid temperature.', 'config');
  const c = await requireConfig(cfg);
  await haRequest(c, 'POST', '/api/services/climate/set_temperature', { body: { entity_id: entityId, temperature } });
}

export async function setHvacMode(entityId: string, hvacMode: HvacMode, cfg?: HaConfig | null): Promise<void> {
  assertEntity(entityId, 'climate');
  const c = await requireConfig(cfg);
  await haRequest(c, 'POST', '/api/services/climate/set_hvac_mode', { body: { entity_id: entityId, hvac_mode: hvacMode } });
}

/**
 * Fetch the camera's current JPEG from /api/camera_proxy/{entity} (token in the Authorization header)
 * and return a blob: object URL. The CALLER owns it and must URL.revokeObjectURL it when replaced.
 */
export async function cameraSnapshotUrl(entityId: string, cfg?: HaConfig | null): Promise<string> {
  assertEntity(entityId, 'camera');
  const c = await requireConfig(cfg);
  const blob = await haRequest(c, 'GET', `/api/camera_proxy/${entityId}`, { blob: true });
  if (!blob.size) throw new HaError('Home Assistant sent an empty camera image.', 'http');
  return URL.createObjectURL(blob);
}

export interface HaTestResult { version: string | null; unit: string; climates: HaClimate[]; cameras: HaCamera[] }

/** Check a candidate config end to end (auth, states) WITHOUT saving it. */
export async function testHaConnection(input: HaConfig): Promise<HaTestResult> {
  const cfg: HaConfig = { baseUrl: normalizeBaseUrl(input.baseUrl), token: (input.token || '').trim() };
  if (!cfg.token) throw new HaError('Paste a Home Assistant long-lived access token.', 'config');
  const conf = await haRequest(cfg, 'GET', '/api/config', {});
  const unit = typeof conf?.unit_system?.temperature === 'string' ? conf.unit_system.temperature : '°C';
  unitCache.set(cfg.baseUrl, unit);
  const states = await getStates(cfg);
  const [climates, cameras] = await Promise.all([climateEntities(cfg, states), cameraEntities(cfg, states)]);
  return { version: typeof conf?.version === 'string' ? conf.version : null, unit, climates, cameras };
}

export const haErrorMessage = (e: unknown): string =>
  e instanceof HaError ? e.message : String((e as any)?.message || e || 'Unknown error');
