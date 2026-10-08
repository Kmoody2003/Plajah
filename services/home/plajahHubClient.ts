/**
 * Client for the Plajah Home hub (routes/homeHubRoutes.ts), used by the web app and the TV APK.
 *
 * Finding the hub, in order:
 *   1. the address saved on this device (setHubUrl, e.g. http://192.168.4.60:3000)
 *   1b. on the TV app: its own embedded hub, http://127.0.0.1:8786 (services/home/hubEntry.ts)
 *   2. this page's own origin, when the app is served by the hub itself (http://localhost:3000)
 *   3. http://localhost:3000 (web on the hub PC: http://localhost is exempt from mixed-content rules)
 *   4. http://plajah-hub.local:3000 (the hub's mDNS beacon; works where the OS resolves .local)
 * The first candidate whose /api/home/ping answers `hub: 'plajah-home'` wins and is cached.
 *
 * Transport: CapacitorHttp on native (the APK allows cleartext to the LAN; no CORS), fetch on web.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type HubDeviceKind = 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'camera';

export interface HubDeviceState {
  on?: boolean;
  brightness?: number | null;
  colorTempK?: number | null;
  ctRangeK?: [number, number];
  temperatureC?: number | null;
  humidityPct?: number | null;
  heatSetpointC?: number | null;
  coolSetpointC?: number | null;
  mode?: string;
  modes?: string[];
  action?: string | null;
  minC?: number | null;
  maxC?: number | null;
  lockState?: string;
  locked?: boolean | null;
  available?: boolean | null;
  lastError?: string;
}

export interface HubDevice {
  id: string;
  source: 'matter' | 'hue' | 'camera';
  kind: HubDeviceKind;
  name: string;
  room?: string;
  online: boolean;
  state: HubDeviceState;
  detail?: string;
}

export interface HubState {
  hub: { name: string; id: string; v: 1; at: string };
  sources: {
    matter: { running: boolean; paired: number; error?: string };
    hue: { linked: boolean; bridgeId?: string; ip?: string; error?: string };
    cameras: { count: number; ffmpeg: boolean; ffmpegVersion?: string };
  };
  devices: HubDevice[];
}

export type HubAction = 'on' | 'off' | 'toggle' | 'brightness' | 'colorTemp' | 'setpoint' | 'mode' | 'lock' | 'unlock';

export class HubError extends Error {
  status?: number;
  kind: 'not-found' | 'network' | 'http' | 'forbidden';
  constructor(message: string, kind: HubError['kind'], status?: number) {
    super(message); this.name = 'HubError'; this.kind = kind; this.status = status;
  }
}

const URL_KEY = 'plajah_hub_url';
const TOKEN_KEY = 'plajah_hub_token';
const DEFAULT_PORT = 3000;
const EMBEDDED_PORT = 8786;

const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage blocked */ } };

const listeners = new Set<() => void>();
/** Fires when the saved hub address / token changes on this device. */
export function onHubConfigChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* listener */ } });

/** Normalise "192.168.4.60", "192.168.4.60:3000" or "http://pc.local:3000/" to an origin. */
export function normalizeHubUrl(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) throw new HubError('Enter the hub address', 'not-found');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const u = new URL(s);
  if (!u.port && u.protocol === 'http:') u.port = String(DEFAULT_PORT);
  return u.origin;
}

export function getSavedHubUrl(): string | null { return lsGet(URL_KEY); }
export function setHubUrl(url: string | null): void { lsSet(URL_KEY, url ? normalizeHubUrl(url) : null); resolved = null; emit(); }
export function getHubToken(): string | null { return lsGet(TOKEN_KEY); }
export function setHubToken(token: string | null): void { lsSet(TOKEN_KEY, token ? token.trim() : null); emit(); }

// ─── Transport ────────────────────────────────────────────────────────────────

interface RawResponse { status: number; data: any; headers: Record<string, string> }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new HubError('The hub did not answer in time', 'network')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function request(base: string, path: string, opts: { method?: string; body?: unknown; timeoutMs?: number; blob?: boolean } = {}): Promise<RawResponse> {
  const url = `${base}${path}`;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const tok = getHubToken();
  if (tok) headers['X-Plajah-Hub-Token'] = tok;

  if (isNative()) {
    try {
      const r = await withTimeout(CapacitorHttp.request({
        url, method: opts.method || 'GET', headers, data: opts.body,
        responseType: opts.blob ? 'blob' : 'json', connectTimeout: timeoutMs, readTimeout: timeoutMs,
      }), timeoutMs + 1000);
      return { status: r.status, data: r.data, headers: r.headers || {} };
    } catch (e: any) {
      if (e instanceof HubError) throw e;
      throw new HubError(`Cannot reach the hub at ${base}`, 'network');
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal, credentials: 'omit' });
    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => { h[k] = v; });
    if (opts.blob) return { status: res.status, data: res.ok ? await res.blob() : await res.json().catch(() => null), headers: h };
    return { status: res.status, data: await res.json().catch(() => null), headers: h };
  } catch (e: any) {
    throw new HubError(e?.name === 'AbortError' ? 'The hub did not answer in time' : `Cannot reach the hub at ${base}`, 'network');
  } finally {
    clearTimeout(t);
  }
}

// ─── Hub discovery ────────────────────────────────────────────────────────────

let resolved: { base: string; at: number } | null = null;
let resolving: Promise<string> | null = null;

function candidates(): string[] {
  const out: string[] = [];
  const saved = getSavedHubUrl();
  if (saved) out.push(saved);
  // The Android TV app runs its own embedded hub (services/home/hubEntry.ts) on loopback.
  if (isNative()) out.push(`http://127.0.0.1:${EMBEDDED_PORT}`);
  if (!isNative() && typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) out.push(location.origin);
  out.push(`http://localhost:${DEFAULT_PORT}`);
  out.push(`http://plajah-hub.local:${DEFAULT_PORT}`);
  return [...new Set(out)];
}

async function probe(base: string): Promise<boolean> {
  try {
    const r = await request(base, '/api/home/ping', { timeoutMs: 2500 });
    return r.status === 200 && r.data?.hub === 'plajah-home';
  } catch { return false; }
}

/** The hub's origin, or throws HubError('not-found'). Cached for 5 minutes. */
export async function findHub(force = false): Promise<string> {
  if (!force && resolved && Date.now() - resolved.at < 5 * 60_000) return resolved.base;
  if (resolving) return resolving;
  resolving = (async () => {
    try {
      for (const base of candidates()) {
        if (await probe(base)) { resolved = { base, at: Date.now() }; return base; }
      }
      resolved = null;
      throw new HubError('No Plajah Home hub found on this network', 'not-found');
    } finally { resolving = null; }
  })();
  return resolving;
}

async function call<T>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  let base = await findHub();
  let r: RawResponse;
  try { r = await request(base, path, opts); }
  catch (e) {
    // The hub may have moved (DHCP) or stopped: look again once.
    base = await findHub(true);
    r = await request(base, path, opts);
  }
  if (r.status === 403) throw new HubError(r.data?.error || 'The hub refused this action', 'forbidden', 403);
  if (r.status < 200 || r.status >= 300 || r.data?.success === false) throw new HubError(r.data?.error || `Hub error (HTTP ${r.status})`, 'http', r.status);
  return r.data as T;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface HubPing { hub: 'plajah-home'; v: 1; id: string; name: string; port: number; admin: boolean; beacon: string | null; base: string }

export async function pingHub(force = false): Promise<HubPing> {
  const base = await findHub(force);
  const r = await request(base, '/api/home/ping', { timeoutMs: 3000 });
  if (r.status !== 200) throw new HubError('The hub did not answer', 'network');
  return { ...r.data, base };
}

export const getHubState = () => call<HubState & { success: true }>('/api/home/state', { timeoutMs: 30_000 });

export const sendHubCommand = (id: string, action: HubAction, value?: number | string, pin?: string) =>
  call<{ success: true; device: HubDevice | null }>('/api/home/command', { method: 'POST', body: { id, action, value, pin }, timeoutMs: 45_000 });

/** A camera snapshot as an image URL usable in <img src>. Revoke with releaseSnapshotUrl. */
export async function fetchCameraSnapshot(cameraDeviceId: string): Promise<string> {
  const camId = cameraDeviceId.replace(/^camera:/, '');
  const base = await findHub();
  const r = await request(base, `/api/home/cameras/${encodeURIComponent(camId)}/snapshot`, { blob: true, timeoutMs: 15_000 });
  if (r.status !== 200) throw new HubError((r.data && r.data.error) || `Snapshot failed (HTTP ${r.status})`, 'http', r.status);
  if (isNative()) {
    if (typeof r.data !== 'string' || !r.data) throw new HubError('The hub sent an empty image', 'http', r.status);
    return `data:image/jpeg;base64,${r.data}`;
  }
  return URL.createObjectURL(r.data as Blob);
}
export function releaseSnapshotUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

// Admin / pairing (the hub PC itself, or a device holding the hub token)
export const hubStatusMatter = () => call<{ success: true; running: boolean; storagePath?: string; pairedNodes: string[]; error?: string }>('/api/matter/status', { timeoutMs: 60_000 });
export const discoverCommissionable = (seconds = 6) => call<{ success: true; devices: Array<{ id: string; name?: string; discriminator: number; commissioningMode: number; vendorId?: number; productId?: number; addresses: string[] }> }>(`/api/matter/discover?seconds=${seconds}`, { timeoutMs: (seconds + 5) * 1000 });
export const networkMatterAdverts = (seconds = 4) => call<{ success: true; adverts: Array<{ compressedFabricId: string; nodeId: string; ipv4: string[]; ipv6: string[]; ownFabric: boolean }> }>(`/api/matter/network?seconds=${seconds}`, { timeoutMs: (seconds + 5) * 1000 });
export const parseMatterCode = (code: string) => call<{ success: true; payload: Record<string, unknown> }>('/api/matter/parse-code', { method: 'POST', body: { code }, timeoutMs: 30_000 });
export const commissionMatter = (code: string, knownAddress?: string) =>
  call<{ success: true; node: { nodeId: string; name: string } }>('/api/matter/commission', { method: 'POST', body: { code, knownAddress, timeoutSeconds: 90 }, timeoutMs: 260_000 });
export const removeMatterNode = (nodeId: string) => call<{ success: boolean; decommissioned: boolean; error?: string }>(`/api/matter/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE', timeoutMs: 50_000 });

export type HuePairing =
  | { state: 'idle' }
  | { state: 'waiting-for-button'; ip: string; startedAt: number; expiresAt: number; lastError?: string }
  | { state: 'paired'; bridgeId: string; ip: string }
  | { state: 'failed'; error: string };
export const discoverHue = () => call<{ success: true; bridges: Array<{ id: string; ip: string; name?: string; model?: string; via: string }>; linked: { linked: boolean; bridgeId?: string; ip?: string } }>('/api/home/hue/discover', { timeoutMs: 15_000 });
export const startHuePairing = (ip?: string) => call<{ success: true; pairing: HuePairing }>('/api/home/hue/pair', { method: 'POST', body: { ip }, timeoutMs: 20_000 });
export const huePairingStatus = () => call<{ success: true; pairing: HuePairing }>('/api/home/hue/pair');
export const unlinkHue = () => call<{ success: true }>('/api/home/hue', { method: 'DELETE' });

export const addCamera = (cam: { name: string; url: string; room?: string }) => call<{ success: true; camera: { id: string; name: string } }>('/api/home/cameras', { method: 'POST', body: cam });
export const removeCamera = (id: string) => call<{ success: boolean }>(`/api/home/cameras/${encodeURIComponent(id.replace(/^camera:/, ''))}`, { method: 'DELETE' });
export const ffmpegStatus = () => call<{ success: true; ok: boolean; version?: string; binary: string }>('/api/home/ffmpeg');
/** Only answers on the hub PC itself. */
export const getHubAdminToken = () => call<{ success: true; token: string }>('/api/home/token');
