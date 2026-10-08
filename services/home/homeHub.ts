/**
 * Plajah Home hub — one device model over every real source on the hub PC:
 *   matter  → services/home/matterControllerService (our own Matter fabric)
 *   hue     → services/home/hueBridgeService (local bridge API)
 *   camera  → services/home/cameraSources (RTSP / JPEG URLs)
 * Each device carries its live state from the device itself. A source that is not set up simply
 * contributes nothing; its status explains why.
 */
import os from 'node:os';
import matterControllerService from './matterControllerService';
import type { MatterEndpointState, MatterNodeInfo } from './matterTypes';
import { hueLinked, listHue, setHueLight, type HueLight } from './hueBridgeService';
import { listCameras, ffmpegStatus } from './cameraSources';
import { hubIdentity } from './hubStorage';

export type HubDeviceKind = 'light' | 'switch' | 'thermostat' | 'lock' | 'sensor' | 'camera';

export interface HubDeviceState {
  on?: boolean;
  /** 0..100 */
  brightness?: number | null;
  colorTempK?: number | null;
  ctRangeK?: [number, number];
  temperatureC?: number | null;
  humidityPct?: number | null;
  heatSetpointC?: number | null;
  coolSetpointC?: number | null;
  /** thermostat mode: off | heat | cool | auto | … */
  mode?: string;
  modes?: string[];
  /** heating | cooling | fan | idle */
  action?: string | null;
  minC?: number | null;
  maxC?: number | null;
  lockState?: string;
  locked?: boolean | null;
  /** camera: last snapshot result (null = not tried yet) */
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
  /** matter: vendor/product; hue: model id; camera: host */
  detail?: string;
}

export interface HubSourceStatus {
  matter: { running: boolean; paired: number; error?: string };
  hue: { linked: boolean; bridgeId?: string; ip?: string; error?: string };
  cameras: { count: number; ffmpeg: boolean; ffmpegVersion?: string };
}

export interface HubState {
  hub: { name: string; id: string; v: 1; at: string };
  sources: HubSourceStatus;
  devices: HubDevice[];
}

export class HubError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'HubError'; this.status = status; }
}

const kToMired = (k: number) => Math.round(1_000_000 / k);
const miredToK = (m: number) => Math.round(1_000_000 / m);

// ─── Mapping ──────────────────────────────────────────────────────────────────

function fromMatter(node: MatterNodeInfo): HubDevice[] {
  const online = node.connection === 'connected';
  const eps = node.endpoints.filter(e => e.kind !== 'other');
  return eps.map(ep => {
    const sameKind = eps.filter(x => x.kind === ep.kind).length > 1;
    const name = ep.label || (sameKind ? `${node.name} ${ep.endpointId}` : node.name);
    const s: HubDeviceState = {};
    if (ep.onOff !== undefined) s.on = ep.onOff;
    if (ep.level !== undefined) s.brightness = ep.level == null ? null : Math.round((ep.level / 254) * 100);
    if (ep.colorTempMireds !== undefined) {
      s.colorTempK = ep.colorTempMireds ? miredToK(ep.colorTempMireds) : null;
      if (ep.colorTempMinMireds && ep.colorTempMaxMireds) s.ctRangeK = [miredToK(ep.colorTempMaxMireds), miredToK(ep.colorTempMinMireds)];
    }
    if (ep.thermostat) {
      const t = ep.thermostat;
      s.temperatureC = t.localTemperatureC;
      s.heatSetpointC = t.heatSetpointC;
      s.coolSetpointC = t.coolSetpointC;
      s.mode = t.systemMode;
      s.modes = ['off', ...(t.canHeat ? ['heat'] : []), ...(t.canCool ? ['cool'] : []), ...(t.canHeat && t.canCool ? ['auto'] : [])];
      s.action = t.runningState ?? null;
      s.minC = t.canHeat ? t.minHeatC ?? null : t.minCoolC ?? null;
      s.maxC = t.canCool ? t.maxCoolC ?? null : t.maxHeatC ?? null;
    }
    if (ep.lock) { s.lockState = ep.lock.state; s.locked = ep.lock.state === 'locked' ? true : ep.lock.state === 'unknown' ? null : false; }
    if (ep.temperatureC !== undefined) s.temperatureC = ep.temperatureC;
    if (ep.humidityPct !== undefined) s.humidityPct = ep.humidityPct;
    return {
      id: `matter:${node.nodeId}:${ep.endpointId}`,
      source: 'matter' as const,
      kind: ep.kind as HubDeviceKind,
      name,
      online,
      state: s,
      detail: [node.vendorName, node.productName].filter(Boolean).join(' ') || undefined,
    };
  });
}

function fromHue(l: HueLight): HubDevice {
  return {
    id: `hue:${l.id}`,
    source: 'hue',
    kind: 'light',
    name: l.name,
    room: l.room,
    online: l.reachable,
    state: { on: l.on, brightness: l.brightness, colorTempK: l.colorTempK, ctRangeK: l.ctRangeK },
    detail: l.model,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

export async function getHubState(): Promise<HubState> {
  const id = hubIdentity().id;
  const sources: HubSourceStatus = { matter: { running: false, paired: 0 }, hue: { linked: false }, cameras: { count: 0, ffmpeg: false } };
  const devices: HubDevice[] = [];

  const matterP = (async () => {
    try {
      const nodes = await matterControllerService.listNodes();
      sources.matter = { running: true, paired: nodes.length };
      for (const n of nodes) devices.push(...fromMatter(n));
    } catch (e: any) {
      sources.matter = { running: false, paired: 0, error: e?.message || String(e) };
    }
  })();

  const hueP = (async () => {
    const link = hueLinked();
    sources.hue = { linked: link.linked, bridgeId: link.bridgeId, ip: link.ip };
    if (!link.linked) return;
    try {
      const { lights } = await listHue();
      for (const l of lights) devices.push(fromHue(l));
    } catch (e: any) {
      sources.hue.error = e?.message || String(e);
    }
  })();

  const camP = (async () => {
    const cams = listCameras();
    const ff = await ffmpegStatus();
    sources.cameras = { count: cams.length, ffmpeg: ff.ok, ffmpegVersion: ff.version };
    for (const c of cams) {
      devices.push({
        id: `camera:${c.id}`, source: 'camera', kind: 'camera', name: c.name, room: c.room,
        online: c.available !== false && (c.kind !== 'rtsp' || ff.ok),
        state: { available: c.available, lastError: c.kind === 'rtsp' && !ff.ok ? 'ffmpeg is not installed on the hub PC' : c.lastError },
        detail: c.host,
      });
    }
  })();

  await Promise.all([matterP, hueP, camP]);
  const order: Record<HubDeviceKind, number> = { thermostat: 0, light: 1, switch: 2, lock: 3, sensor: 4, camera: 5 };
  devices.sort((a, b) => order[a.kind] - order[b.kind] || (a.room || '~').localeCompare(b.room || '~') || a.name.localeCompare(b.name));
  return { hub: { name: `Plajah Home on ${os.hostname()}`, id, v: 1, at: new Date().toISOString() }, sources, devices };
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export type HubAction = 'on' | 'off' | 'toggle' | 'brightness' | 'colorTemp' | 'setpoint' | 'mode' | 'lock' | 'unlock';
export const ADMIN_ACTIONS: HubAction[] = ['lock', 'unlock'];

export interface HubCommand { id: string; action: HubAction; value?: number | string; pin?: string }

function numberValue(v: unknown, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HubError(`${what} needs a numeric value`);
  return n;
}

export async function runHubCommand(cmd: HubCommand): Promise<HubDevice | null> {
  const [source, ...rest] = String(cmd.id || '').split(':');
  if (source === 'hue') {
    const lightId = rest[0];
    let change: Parameters<typeof setHueLight>[1];
    switch (cmd.action) {
      case 'on': change = { on: true }; break;
      case 'off': change = { on: false }; break;
      case 'toggle': {
        const cur = (await listHue()).lights.find(l => l.id === lightId);
        if (!cur) throw new HubError('Unknown Hue light', 404);
        change = { on: !cur.on }; break;
      }
      case 'brightness': change = { brightness: numberValue(cmd.value, 'brightness') }; break;
      case 'colorTemp': change = { colorTempK: numberValue(cmd.value, 'colorTemp') }; break;
      default: throw new HubError(`Hue lights do not support ${cmd.action}`);
    }
    const l = await setHueLight(lightId, change);
    const room = (await listHue().catch(() => null))?.lights.find(x => x.id === lightId)?.room;
    return fromHue({ ...l, room });
  }

  if (source === 'matter') {
    const [nodeId, epStr] = rest;
    const endpointId = Number(epStr);
    if (!nodeId || !Number.isInteger(endpointId)) throw new HubError('Bad Matter device id');
    let ep: MatterEndpointState;
    switch (cmd.action) {
      case 'on': case 'off': case 'toggle':
        ep = await matterControllerService.command({ nodeId, endpointId, command: cmd.action }); break;
      case 'brightness': {
        const pct = Math.max(0, Math.min(100, numberValue(cmd.value, 'brightness')));
        ep = pct === 0
          ? await matterControllerService.command({ nodeId, endpointId, command: 'off' })
          : await matterControllerService.command({ nodeId, endpointId, command: 'level', value: Math.max(1, Math.round((pct / 100) * 254)) });
        break;
      }
      case 'colorTemp':
        ep = await matterControllerService.command({ nodeId, endpointId, command: 'colorTemp', value: kToMired(Math.max(1500, Math.min(10000, numberValue(cmd.value, 'colorTemp')))) }); break;
      case 'setpoint': {
        const target = numberValue(cmd.value, 'setpoint');
        const node = await matterControllerService.getNode(nodeId);
        const t = node.endpoints.find(e => e.endpointId === endpointId)?.thermostat;
        if (!t) throw new HubError('That device is not a thermostat', 404);
        const useCool = t.systemMode === 'cool' || (!t.canHeat && t.canCool);
        ep = await matterControllerService.command({ nodeId, endpointId, command: useCool ? 'coolSetpoint' : 'heatSetpoint', value: target });
        break;
      }
      case 'mode':
        ep = await matterControllerService.command({ nodeId, endpointId, command: 'systemMode', value: String(cmd.value) }); break;
      case 'lock': case 'unlock':
        ep = await matterControllerService.command({ nodeId, endpointId, command: cmd.action, pin: cmd.pin }); break;
      default: throw new HubError(`Unknown action ${cmd.action}`);
    }
    const node = await matterControllerService.getNode(nodeId);
    const merged = { ...node, endpoints: node.endpoints.map(e => (e.endpointId === ep.endpointId ? ep : e)) };
    return fromMatter(merged).find(d => d.id === `matter:${nodeId}:${endpointId}`) || null;
  }

  if (source === 'camera') throw new HubError('Cameras have no commands; fetch /api/home/cameras/:id/snapshot');
  throw new HubError('Unknown device id', 404);
}
