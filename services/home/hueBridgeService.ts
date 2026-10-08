/**
 * Philips Hue bridge, local API (server side, Plajah Home hub).
 *
 *  · discover(): DNS-SD `_hue._tcp` on the LAN, falling back to https://discovery.meethue.com.
 *  · pair(): POST /api {devicetype} — the bridge only answers with an app key within ~30s of its
 *    round link button being pressed, so pairing runs as a 30s background poll the UI watches.
 *  · The app key is stored on disk (hubStorage → %USERPROFILE%\.plajah-home\hue.json), never sent to
 *    clients.
 *  · Lights / rooms / control use the bridge's local v1 REST API over plain HTTP on the LAN
 *    (supported by every v2 "square" bridge incl. BSB002; avoids the self-signed TLS of CLIP v2).
 */
import { browse } from './homeMdns';
import { readHubJson, writeHubJson } from './hubStorage';

export interface HueBridgeCandidate { id: string; ip: string; name?: string; model?: string; via: 'mdns' | 'cloud' | 'manual' }

interface HueStore { bridgeId: string; ip: string; appKey: string; clientKey?: string; pairedAt: string; name?: string }

export interface HueLight {
  id: string;
  name: string;
  room?: string;
  reachable: boolean;
  on: boolean;
  /** 0..100 (null when the light is not dimmable) */
  brightness: number | null;
  /** Kelvin (null when not tunable white) */
  colorTempK: number | null;
  ctRangeK?: [number, number];
  type: string;
  model?: string;
}

export interface HueRoom { id: string; name: string; type: string; lightIds: string[]; anyOn: boolean; allOn: boolean }

export type HuePairState =
  | { state: 'idle' }
  | { state: 'waiting-for-button'; ip: string; startedAt: number; expiresAt: number; lastError?: string }
  | { state: 'paired'; bridgeId: string; ip: string }
  | { state: 'failed'; error: string };

export class HueError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'HueError'; this.status = status; }
}

const FILE = 'hue.json';
let pairState: HuePairState = { state: 'idle' };
let pairTimer: ReturnType<typeof setTimeout> | undefined;

async function http(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 6000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new HueError(`Bridge returned non-JSON (HTTP ${res.status})`, 502); }
  } catch (e: any) {
    if (e instanceof HueError) throw e;
    throw new HueError(e?.name === 'AbortError' ? 'Hue bridge did not answer in time' : `Cannot reach Hue bridge: ${e?.message || e}`, 504);
  } finally {
    clearTimeout(t);
  }
}

const store = (): HueStore | null => {
  const s = readHubJson<HueStore | null>(FILE, null);
  return s && s.appKey && s.ip ? s : null;
};

const isIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s);

export async function discoverBridges(seconds = 3): Promise<HueBridgeCandidate[]> {
  const out = new Map<string, HueBridgeCandidate>();
  const found = await browse(['_hue._tcp'], seconds * 1000);
  for (const f of found) {
    const ip = f.ipv4[0];
    if (!ip) continue;
    const id = (f.txt.bridgeid || f.label).toLowerCase();
    out.set(id, { id, ip, name: f.label, model: f.txt.modelid, via: 'mdns' });
  }
  if (!out.size) {
    try {
      const list = await http('https://discovery.meethue.com/', { timeoutMs: 6000 });
      if (Array.isArray(list)) for (const b of list) if (b?.id && b?.internalipaddress) out.set(String(b.id).toLowerCase(), { id: String(b.id).toLowerCase(), ip: b.internalipaddress, via: 'cloud' });
    } catch { /* offline / rate limited */ }
  }
  return [...out.values()];
}

async function bridgeConfig(ip: string): Promise<{ bridgeid: string; name: string; modelid: string; swversion: string; apiversion: string }> {
  const c = await http(`http://${ip}/api/config`);
  if (!c?.bridgeid) throw new HueError(`${ip} is not a Hue bridge`, 404);
  return c;
}

function stopPairing() { if (pairTimer) clearTimeout(pairTimer); pairTimer = undefined; }

/**
 * Start (or restart) pairing with the bridge at `ip` (or the first discovered one). Returns at once
 * with the first attempt's outcome; if the button has not been pressed yet the hub keeps trying
 * every 2s for 30s. Poll pairStatus().
 */
export async function startPairing(ipIn?: string): Promise<HuePairState> {
  stopPairing();
  let ip = (ipIn || '').trim();
  if (ip && !isIp(ip)) throw new HueError('Bridge address must be an IPv4 address');
  if (!ip) {
    const bridges = await discoverBridges();
    if (!bridges.length) { pairState = { state: 'failed', error: 'No Hue bridge found on this network' }; return pairState; }
    ip = bridges[0].ip;
  }
  const cfg = await bridgeConfig(ip);
  const startedAt = Date.now();
  pairState = { state: 'waiting-for-button', ip, startedAt, expiresAt: startedAt + 30_000 };

  const attempt = async (): Promise<void> => {
    try {
      const r = await http(`http://${ip}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'plajah#home-hub', generateclientkey: true }),
      });
      const first = Array.isArray(r) ? r[0] : null;
      if (first?.success?.username) {
        writeHubJson(FILE, { bridgeId: cfg.bridgeid.toLowerCase(), ip, appKey: first.success.username, clientKey: first.success.clientkey, pairedAt: new Date().toISOString(), name: cfg.name } satisfies HueStore);
        pairState = { state: 'paired', bridgeId: cfg.bridgeid.toLowerCase(), ip };
        stopPairing();
        return;
      }
      const err = first?.error;
      if (pairState.state === 'waiting-for-button') pairState.lastError = err?.type === 101 ? 'Press the round link button on the Hue bridge' : (err?.description || 'Unexpected bridge answer');
    } catch (e: any) {
      if (pairState.state === 'waiting-for-button') pairState.lastError = e?.message || String(e);
    }
    if (pairState.state === 'waiting-for-button') {
      if (Date.now() >= pairState.expiresAt) {
        pairState = { state: 'failed', error: 'The link button was not pressed within 30 seconds. Press it, then try Connect again.' };
        stopPairing();
      } else {
        pairTimer = setTimeout(() => { void attempt(); }, 2000);
      }
    }
  };
  await attempt();
  return pairState;
}

export function pairStatus(): HuePairState {
  if (pairState.state === 'idle') {
    const s = store();
    if (s) return { state: 'paired', bridgeId: s.bridgeId, ip: s.ip };
  }
  return pairState;
}

export function hueLinked(): { linked: boolean; bridgeId?: string; ip?: string; name?: string; pairedAt?: string } {
  const s = store();
  return s ? { linked: true, bridgeId: s.bridgeId, ip: s.ip, name: s.name, pairedAt: s.pairedAt } : { linked: false };
}

export function unlinkHue(): void {
  writeHubJson(FILE, null);
  pairState = { state: 'idle' };
}

/** If the bridge moved to a new DHCP address, find it again by id. */
async function resolveBridge(s: HueStore): Promise<HueStore> {
  try {
    const cfg = await bridgeConfig(s.ip);
    if (cfg.bridgeid.toLowerCase() === s.bridgeId) return s;
  } catch { /* moved or offline */ }
  const found = (await discoverBridges()).find(b => b.id === s.bridgeId);
  if (!found) throw new HueError('Hue bridge is not reachable on the network', 503);
  const next = { ...s, ip: found.ip };
  writeHubJson(FILE, next);
  return next;
}

async function api(path: string, init?: RequestInit): Promise<any> {
  let s = store();
  if (!s) throw new HueError('Hue bridge is not connected', 409);
  let r: any;
  try {
    r = await http(`http://${s.ip}/api/${s.appKey}${path}`, init);
  } catch (e) {
    s = await resolveBridge(s);
    r = await http(`http://${s.ip}/api/${s.appKey}${path}`, init);
  }
  const err = Array.isArray(r) ? r.find((x: any) => x?.error)?.error : undefined;
  if (err?.type === 1) throw new HueError('The Hue bridge no longer accepts Plajah\'s key. Connect it again.', 401);
  if (err) throw new HueError(`Hue: ${err.description}`, 400);
  return r;
}

const miredToK = (m: number) => Math.round(1_000_000 / m);

export async function listHue(): Promise<{ lights: HueLight[]; rooms: HueRoom[] }> {
  const [lights, groups] = await Promise.all([api('/lights'), api('/groups')]);
  const rooms: HueRoom[] = Object.entries(groups || {})
    .filter(([, g]: any) => g?.type === 'Room' || g?.type === 'Zone')
    .map(([id, g]: any) => ({ id, name: g.name, type: g.type, lightIds: (g.lights || []).map(String), anyOn: !!g.state?.any_on, allOn: !!g.state?.all_on }));
  const roomOf = (id: string) => rooms.find(r => r.type === 'Room' && r.lightIds.includes(id))?.name;
  const out: HueLight[] = Object.entries(lights || {}).map(([id, l]: any) => {
    const st = l.state || {};
    const ct = l.capabilities?.control?.ct;
    return {
      id,
      name: l.name,
      room: roomOf(id),
      reachable: st.reachable !== false,
      on: !!st.on,
      brightness: typeof st.bri === 'number' ? Math.max(1, Math.round((st.bri / 254) * 100)) : null,
      colorTempK: typeof st.ct === 'number' ? miredToK(st.ct) : null,
      ctRangeK: ct?.min && ct?.max ? [miredToK(ct.max), miredToK(ct.min)] : undefined,
      type: l.type,
      model: l.modelid,
    };
  });
  return { lights: out, rooms };
}

export async function setHueLight(id: string, change: { on?: boolean; brightness?: number; colorTempK?: number; transitionMs?: number }): Promise<HueLight> {
  if (!/^\d+$/.test(id)) throw new HueError('Invalid Hue light id');
  const body: Record<string, unknown> = {};
  if (typeof change.on === 'boolean') body.on = change.on;
  if (typeof change.brightness === 'number') {
    const pct = Math.max(0, Math.min(100, change.brightness));
    if (pct === 0) body.on = false;
    else { body.bri = Math.max(1, Math.round((pct / 100) * 254)); if (change.on === undefined) body.on = true; }
  }
  if (typeof change.colorTempK === 'number') body.ct = Math.max(153, Math.min(500, Math.round(1_000_000 / Math.max(2000, Math.min(6500, change.colorTempK)))));
  if (typeof change.transitionMs === 'number') body.transitiontime = Math.round(Math.max(0, change.transitionMs) / 100);
  if (!Object.keys(body).length) throw new HueError('Nothing to change');
  await api(`/lights/${id}/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const l = await api(`/lights/${id}`);
  const st = l.state || {};
  const ct = l.capabilities?.control?.ct;
  return {
    id, name: l.name, reachable: st.reachable !== false, on: !!st.on,
    brightness: typeof st.bri === 'number' ? Math.max(1, Math.round((st.bri / 254) * 100)) : null,
    colorTempK: typeof st.ct === 'number' ? miredToK(st.ct) : null,
    ctRangeK: ct?.min && ct?.max ? [miredToK(ct.max), miredToK(ct.min)] : undefined,
    type: l.type, model: l.modelid,
  };
}
