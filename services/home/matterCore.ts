/**
 * Plajah Home — Matter controller core. Runs matter.js 0.12.6 (@project-chip/matter.js
 * CommissioningController on the @matter/nodejs platform).
 *
 * Used two ways (services/home/matterControllerService.ts decides):
 *  · in-process — the Android TV hub (nodejs-mobile, no child_process) and any bundled hub;
 *  · inside matterWorker.ts — a plain-Node child process on the PC dev server, because under the tsx
 *    loader importing the matter.js graph takes 2+ minutes (plain Node: ~4 s).
 * This file must stay erasable TypeScript (no enums, no parameter properties) so plain Node can
 * type-strip it, and must avoid Intl / \p{...} regexes (nodejs-mobile has no ICU).
 * matter.js is imported lazily on first use.
 *
 *  · The controller owns its fabric ("Plajah Home"), persisted in PLAJAH_MATTER_DIR
 *    (default <PLAJAH_HOME_DIR or ~/.plajah-home>/matter). The root CA is written on first boot; the
 *    fabric record itself is written by matter.js after the first successful commissioning.
 *  · commission(): real PASE → CASE commissioning over IP (Wi-Fi / Ethernet / Thread via a border
 *    router). Multi-admin codes from Alexa / Google / Apple work like any other code. No BLE.
 *  · State comes from the device: matter.js' attribute subscription cache (autoSubscribe) or a
 *    remote read. Commands go to the device and the endpoint is re-read afterwards.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { MatterEndpointState, MatterNodeInfo, MatterCommand } from './matterTypes';

export class MatterHubError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'MatterHubError'; this.status = status; }
}

const storageDir = (): string => process.env.PLAJAH_MATTER_DIR || path.join(process.env.PLAJAH_HOME_DIR || path.join(os.homedir(), '.plajah-home'), 'matter');

// ─── Lazy matter.js boot ──────────────────────────────────────────────────────

interface Ctx {
  controller: any;
  general: any;
  types: any;
  clusters: Record<string, any>;
  storagePath: string;
  nodes: Map<string, any>; // nodeId(string) → PairedNode
}

let bootPromise: Promise<Ctx> | null = null;
let bootError: string | null = null;

const SYSTEM_MODES: Record<number, string> = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 5: 'emergency-heat', 6: 'precooling', 7: 'fan-only', 8: 'dry', 9: 'sleep' };
const SYSTEM_MODE_IDS: Record<string, number> = { off: 0, auto: 1, cool: 3, heat: 4 };
const LOCK_STATES: Record<number, NonNullable<MatterEndpointState['lock']>['state']> = { 0: 'not-fully-locked', 1: 'locked', 2: 'unlocked', 3: 'unlatched' };
const NODE_STATES = ['connected', 'disconnected', 'reconnecting', 'waiting-for-discovery'] as const;

const DEVICE_TYPE_NAMES: Record<number, string> = {
  0x0016: 'Root Node', 0x000e: 'Aggregator', 0x0013: 'Bridged Node', 0x0011: 'Power Source',
  0x0100: 'On/Off Light', 0x0101: 'Dimmable Light', 0x010c: 'Color Temperature Light', 0x010d: 'Extended Color Light',
  0x010a: 'On/Off Plug-in Unit', 0x010b: 'Dimmable Plug-In Unit', 0x0103: 'On/Off Light Switch', 0x0104: 'Dimmer Switch',
  0x0301: 'Thermostat', 0x000a: 'Door Lock', 0x0302: 'Temperature Sensor', 0x0307: 'Humidity Sensor',
  0x0015: 'Contact Sensor', 0x0107: 'Occupancy Sensor', 0x0106: 'Light Sensor', 0x002b: 'Fan', 0x0202: 'Window Covering',
  0x0022: 'Speaker', 0x0028: 'Basic Video Player', 0x0023: 'Casting Video Player', 0x000f: 'Generic Switch',
};

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new MatterHubError(`${what} timed out after ${Math.round(ms / 1000)}s`, 504)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function boot(): Promise<Ctx> {
  const storagePath = storageDir();
  fs.mkdirSync(storagePath, { recursive: true });
  const general: any = await import('@matter/general');
  await import('@matter/nodejs'); // registers Environment.default (Node crypto, network, disk storage)
  const matter: any = await import('@project-chip/matter.js');
  const types: any = await import('@matter/types');
  const clusterMods = await Promise.all([
    import('@matter/types/clusters/on-off'),
    import('@matter/types/clusters/level-control'),
    import('@matter/types/clusters/color-control'),
    import('@matter/types/clusters/thermostat'),
    import('@matter/types/clusters/door-lock'),
    import('@matter/types/clusters/temperature-measurement'),
    import('@matter/types/clusters/relative-humidity-measurement'),
    import('@matter/types/clusters/basic-information'),
    import('@matter/types/clusters/bridged-device-basic-information'),
    import('@matter/types/clusters/general-commissioning'),
  ]) as any[];
  const [onOff, level, color, thermostat, doorLock, temp, humidity, basic, bridged, generalCommissioning] = clusterMods;
  const clusters = {
    OnOff: onOff.OnOff.Cluster,
    LevelControl: level.LevelControl.Cluster,
    ColorControl: color.ColorControl.Cluster,
    Thermostat: thermostat.Thermostat.Cluster,
    ThermostatNs: thermostat.Thermostat,
    DoorLock: doorLock.DoorLock.Cluster,
    TemperatureMeasurement: temp.TemperatureMeasurement.Cluster,
    RelativeHumidityMeasurement: humidity.RelativeHumidityMeasurement.Cluster,
    BasicInformation: basic.BasicInformation.Cluster,
    BridgedDeviceBasicInformation: bridged.BridgedDeviceBasicInformation.Cluster,
    GeneralCommissioning: generalCommissioning.GeneralCommissioning,
  };

  const { Environment, Logger, LogLevel } = general;
  const lvl = String(process.env.MATTER_LOG_LEVEL || 'warn').toUpperCase();
  Logger.defaultLogLevel = LogLevel[lvl] ?? LogLevel.WARN;

  const environment = Environment.default;
  environment.vars.set('path.root', storagePath);
  environment.vars.set('storage.path', storagePath);

  const controller = new matter.CommissioningController({
    environment: { environment, id: 'plajah-home-controller' },
    autoConnect: false,
    adminFabricLabel: 'Plajah Home',
  });
  await controller.start();

  const ctx: Ctx = { controller, general, types, clusters, storagePath, nodes: new Map() };
  // Reconnect every node this fabric already owns (state arrives via subscription).
  for (const id of controller.getCommissionedNodes()) {
    void attachNode(ctx, id).catch(e => console.warn('[MatterHub] reconnect failed for', String(id), e?.message || e));
  }
  console.log(`[MatterHub] controller up — fabric storage ${storagePath}, ${controller.getCommissionedNodes().length} paired node(s)`);
  return ctx;
}

async function ctx(): Promise<Ctx> {
  if (!bootPromise) {
    bootPromise = boot().catch(e => {
      bootError = e?.message || String(e);
      bootPromise = null;
      throw new MatterHubError(`Matter controller failed to start: ${bootError}`, 500);
    });
  }
  return bootPromise;
}

async function attachNode(c: Ctx, nodeId: any): Promise<any> {
  const key = String(nodeId);
  const existing = c.nodes.get(key);
  if (existing) return existing;
  const node = await c.controller.getNode(nodeId);
  c.nodes.set(key, node);
  if (!node.isConnected) node.connect({ autoSubscribe: true });
  return node;
}

function toNodeId(c: Ctx, raw: string): any {
  const s = String(raw).trim();
  if (!/^(0x[0-9a-f]+|\d+)$/i.test(s)) throw new MatterHubError(`Invalid nodeId "${raw}"`);
  return c.types.NodeId(BigInt(s));
}

async function nodeFor(c: Ctx, nodeIdRaw: string): Promise<any> {
  const id = toNodeId(c, nodeIdRaw);
  if (!c.controller.isNodeCommissioned(id)) throw new MatterHubError(`Node ${nodeIdRaw} is not paired with Plajah Home`, 404);
  return attachNode(c, id);
}

// ─── Reading ──────────────────────────────────────────────────────────────────

async function attr(client: any, name: string): Promise<any> {
  if (!client) return undefined;
  try {
    const a = client.attributes?.[name];
    if (!a) return undefined;
    // Subscribed nodes answer from the subscription cache; otherwise this asks the device.
    return await withTimeout(a.get(), 8000, `read ${name}`);
  } catch {
    return undefined;
  }
}

function allEndpoints(node: any): any[] {
  const out: any[] = [];
  const walk = (eps: any[]) => {
    for (const ep of eps || []) {
      out.push(ep);
      try { walk(ep.getChildEndpoints?.() || []); } catch { /* none */ }
    }
  };
  walk(node.getDevices?.() || []);
  // de-dup by number (aggregator children can appear twice depending on structure)
  const seen = new Set<number>();
  return out.filter(ep => { const n = Number(ep.number ?? ep.getNumber?.()); if (seen.has(n)) return false; seen.add(n); return true; });
}

const cToNum = (v: any) => (typeof v === 'number' ? Math.round(v) / 100 : null);

async function readEndpoint(c: Ctx, ep: any): Promise<MatterEndpointState> {
  const endpointId = Number(ep.number ?? ep.getNumber?.());
  let deviceTypes: { code: number; name: string }[] = [];
  try {
    deviceTypes = (ep.getDeviceTypes?.() || []).map((d: any) => ({ code: Number(d.code), name: DEVICE_TYPE_NAMES[Number(d.code)] || d.name || `0x${Number(d.code).toString(16)}` }));
  } catch { /* none */ }
  const clientsList: any[] = (() => { try { return ep.getAllClusterClients?.() || []; } catch { return []; } })();
  const clusterNames = clientsList.map(cl => cl.name).filter(Boolean);
  const get = (cluster: any) => { try { return ep.getClusterClient(cluster); } catch { return undefined; } };

  const st: MatterEndpointState = { endpointId, kind: 'other', deviceTypes, clusters: clusterNames };
  const codes = new Set(deviceTypes.map(d => d.code));

  const bridged = get(c.clusters.BridgedDeviceBasicInformation);
  if (bridged) {
    const label = (await attr(bridged, 'nodeLabel')) || (await attr(bridged, 'productName'));
    if (label) st.label = String(label);
  }

  const onOff = get(c.clusters.OnOff);
  if (onOff) { const v = await attr(onOff, 'onOff'); if (typeof v === 'boolean') st.onOff = v; }
  const lvl = get(c.clusters.LevelControl);
  if (lvl) {
    st.level = (await attr(lvl, 'currentLevel')) ?? null;
    const mn = await attr(lvl, 'minLevel'); if (typeof mn === 'number') st.minLevel = mn;
    const mx = await attr(lvl, 'maxLevel'); if (typeof mx === 'number') st.maxLevel = mx;
  }
  const col = get(c.clusters.ColorControl);
  if (col) {
    const ct = await attr(col, 'colorTemperatureMireds');
    if (ct !== undefined) {
      st.colorTempMireds = ct ?? null;
      const mn = await attr(col, 'colorTempPhysicalMinMireds'); if (typeof mn === 'number') st.colorTempMinMireds = mn;
      const mx = await attr(col, 'colorTempPhysicalMaxMireds'); if (typeof mx === 'number') st.colorTempMaxMireds = mx;
    }
  }
  const th = get(c.clusters.Thermostat);
  if (th) {
    const feats = th.supportedFeatures || {};
    const mode = await attr(th, 'systemMode');
    const running = await attr(th, 'thermostatRunningState');
    st.thermostat = {
      localTemperatureC: cToNum(await attr(th, 'localTemperature')),
      heatSetpointC: feats.heating ? cToNum(await attr(th, 'occupiedHeatingSetpoint')) : null,
      coolSetpointC: feats.cooling ? cToNum(await attr(th, 'occupiedCoolingSetpoint')) : null,
      systemMode: typeof mode === 'number' ? (SYSTEM_MODES[mode] || `mode-${mode}`) : 'unknown',
      runningState: running && typeof running === 'object'
        ? (running.heat || running.heatStage2 ? 'heating' : running.cool || running.coolStage2 ? 'cooling' : running.fan ? 'fan' : 'idle')
        : null,
      minHeatC: feats.heating ? cToNum(await attr(th, 'absMinHeatSetpointLimit')) : null,
      maxHeatC: feats.heating ? cToNum(await attr(th, 'absMaxHeatSetpointLimit')) : null,
      minCoolC: feats.cooling ? cToNum(await attr(th, 'absMinCoolSetpointLimit')) : null,
      maxCoolC: feats.cooling ? cToNum(await attr(th, 'absMaxCoolSetpointLimit')) : null,
      canHeat: !!feats.heating,
      canCool: !!feats.cooling,
    };
  }
  const lock = get(c.clusters.DoorLock);
  if (lock) {
    const s = await attr(lock, 'lockState');
    st.lock = { state: typeof s === 'number' ? (LOCK_STATES[s] || 'unknown') : 'unknown' };
  }
  const temp = get(c.clusters.TemperatureMeasurement);
  if (temp) st.temperatureC = cToNum(await attr(temp, 'measuredValue'));
  const hum = get(c.clusters.RelativeHumidityMeasurement);
  if (hum) { const v = await attr(hum, 'measuredValue'); st.humidityPct = typeof v === 'number' ? Math.round(v) / 100 : null; }

  if (th || codes.has(0x0301)) st.kind = 'thermostat';
  else if (lock || codes.has(0x000a)) st.kind = 'lock';
  else if ([0x0100, 0x0101, 0x010c, 0x010d].some(x => codes.has(x)) || (onOff && (lvl || col) && !codes.has(0x010a) && !codes.has(0x010b))) st.kind = 'light';
  else if (onOff) st.kind = 'switch';
  else if (temp || hum) st.kind = 'sensor';
  return st;
}

async function describeNode(c: Ctx, key: string, node: any): Promise<MatterNodeInfo> {
  const bi = (node.basicInformation || {}) as Record<string, any>;
  const state = NODE_STATES[Number(node.state)] ?? 'disconnected';
  const endpoints: MatterEndpointState[] = [];
  if (node.initialized) {
    for (const ep of allEndpoints(node)) {
      const s = await readEndpoint(c, ep);
      if (s.deviceTypes.some(d => d.code === 0x000e) && s.kind === 'other') continue; // bare aggregator
      endpoints.push(s);
    }
  }
  const nodeLabel = typeof bi.nodeLabel === 'string' && bi.nodeLabel.trim() ? bi.nodeLabel.trim() : undefined;
  return {
    nodeId: key,
    connection: state,
    initialized: !!node.initialized,
    name: nodeLabel || [bi.vendorName, bi.productName].filter(Boolean).join(' ') || `Matter node ${key}`,
    vendorName: bi.vendorName,
    productName: bi.productName,
    nodeLabel,
    vendorId: typeof bi.vendorId === 'number' ? bi.vendorId : undefined,
    productId: typeof bi.productId === 'number' ? bi.productId : undefined,
    serialNumber: bi.serialNumber,
    softwareVersion: bi.softwareVersionString,
    endpoints,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function pickCluster(c: Ctx, command: MatterCommand['command']) {
  switch (command) {
    case 'on': case 'off': case 'toggle': return c.clusters.OnOff;
    case 'level': return c.clusters.LevelControl;
    case 'colorTemp': return c.clusters.ColorControl;
    case 'heatSetpoint': case 'coolSetpoint': case 'setpointRaiseLower': case 'systemMode': return c.clusters.Thermostat;
    case 'lock': case 'unlock': return c.clusters.DoorLock;
  }
}


export class MatterCore {
  /** Close the controller (sessions, sockets). Safe to call when it never started. */
  async shutdown(): Promise<void> {
    const p = bootPromise;
    bootPromise = null;
    if (!p) return;
    try { const c = await p; c.nodes.clear(); await c.controller.close(); } catch { /* not running */ }
  }

  /** Start the controller now (it otherwise starts on the first call). */
  async boot(): Promise<void> { await ctx(); }

  /** Boots the controller (creates the fabric on first run). */
  async status() {
    try {
      const c = await ctx();
      return {
        running: true,
        storagePath: c.storagePath,
        controllerNodeId: c.controller.nodeId !== undefined ? String(c.controller.nodeId) : null,
        fabricLabel: 'Plajah Home',
        pairedNodes: c.controller.getCommissionedNodes().map((n: any) => String(n)),
      };
    } catch (e: any) {
      return { running: false, error: e?.message || bootError || 'unknown error', pairedNodes: [] as string[] };
    }
  }

  async listNodes(): Promise<MatterNodeInfo[]> {
    const c = await ctx();
    const out: MatterNodeInfo[] = [];
    for (const id of c.controller.getCommissionedNodes()) {
      const key = String(id);
      try {
        const node = await attachNode(c, id);
        out.push(await describeNode(c, key, node));
      } catch (e: any) {
        out.push({ nodeId: key, connection: 'disconnected', initialized: false, name: `Matter node ${key}`, endpoints: [] });
      }
    }
    return out;
  }

  async getNode(nodeIdRaw: string): Promise<MatterNodeInfo> {
    const c = await ctx();
    const node = await nodeFor(c, nodeIdRaw);
    return describeNode(c, String(toNodeId(c, nodeIdRaw)), node);
  }

  /**
   * Commission with a manual pairing code (11/21 digits) or a QR payload (MT:...).
   * Multi-admin codes from Alexa / Google / Apple work the same way.
   */
  async commission(opts: { code: string; knownAddress?: string; timeoutSeconds?: number }): Promise<MatterNodeInfo> {
    const c = await ctx();
    const raw = String(opts.code || '').trim();
    if (!raw) throw new MatterHubError('A Matter pairing code or QR payload (MT:…) is required');

    let passcode: number;
    let identifierData: Record<string, number>;
    try {
      if (raw.toUpperCase().startsWith('MT:')) {
        const qr = c.types.QrPairingCodeCodec.decode(raw.toUpperCase())[0];
        passcode = qr.passcode;
        identifierData = { longDiscriminator: qr.discriminator };
      } else {
        const digits = raw.replace(/[^0-9]/g, '');
        if (digits.length !== 11 && digits.length !== 21) throw new Error('manual codes have 11 or 21 digits');
        const m = c.types.ManualPairingCodeCodec.decode(digits);
        passcode = m.passcode;
        identifierData = m.discriminator !== undefined ? { longDiscriminator: m.discriminator } : { shortDiscriminator: m.shortDiscriminator };
      }
    } catch (e: any) {
      throw new MatterHubError(`That is not a valid Matter pairing code (${e?.message || 'decode failed'})`);
    }

    let knownAddress: any;
    if (opts.knownAddress) {
      const m = String(opts.knownAddress).trim().match(/^\[?([0-9a-fA-F:.]+)\]?(?::(\d+))?$/);
      if (!m) throw new MatterHubError('knownAddress must be an IP (optionally with :port)');
      knownAddress = { type: 'udp', ip: m[1], port: m[2] ? Number(m[2]) : 5540 };
    }

    const timeoutSeconds = Math.max(20, Math.min(180, opts.timeoutSeconds ?? 60));
    const GC = c.clusters.GeneralCommissioning;
    let nodeId: any;
    try {
      nodeId = await withTimeout(c.controller.commissionNode({
        commissioning: {
          regulatoryLocation: GC.RegulatoryLocationType.IndoorOutdoor,
          regulatoryCountryCode: 'XX',
        },
        discovery: {
          identifierData,
          discoveryCapabilities: { onIpNetwork: true },
          knownAddress,
          timeoutSeconds,
        },
        passcode,
        autoSubscribe: true,
      }), (timeoutSeconds + 90) * 1000, 'Commissioning');
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/discover|no device|not found|timed out/i.test(msg)) {
        throw new MatterHubError(`No device answered with that code on the network (${msg}). Make sure the pairing window is open (share codes expire after a few minutes) and the device is on this network.`, 504);
      }
      if (/pase|passcode|spake|verifier/i.test(msg)) throw new MatterHubError(`The device rejected the code (${msg}). Generate a fresh code and try again.`, 400);
      throw new MatterHubError(`Commissioning failed: ${msg}`, 502);
    }
    const key = String(nodeId);
    const node = await attachNode(c, nodeId);
    try { await withTimeout(node.events.initialized, 30_000, 'Initial read'); } catch { /* describe what we have */ }
    return describeNode(c, key, node);
  }

  async command(cmd: MatterCommand): Promise<MatterEndpointState> {
    const c = await ctx();
    const node = await nodeFor(c, cmd.nodeId);
    if (!node.initialized) {
      try { await withTimeout(node.events.initialized, 15_000, 'Connecting to node'); } catch { throw new MatterHubError('The device is not reachable right now', 503); }
    }
    const eps = allEndpoints(node);
    const ep = cmd.endpointId !== undefined
      ? eps.find(e => Number(e.number ?? e.getNumber?.()) === Number(cmd.endpointId))
      : eps.find(e => { try { return !!e.getClusterClient(pickCluster(c, cmd.command)); } catch { return false; } });
    if (!ep) throw new MatterHubError('No endpoint on this node supports that command', 404);
    const client = (() => { try { return ep.getClusterClient(pickCluster(c, cmd.command)); } catch { return undefined; } })();
    if (!client) throw new MatterHubError(`Endpoint ${cmd.endpointId ?? '?'} has no ${pickCluster(c, cmd.command)?.name || ''} cluster`, 404);

    const tt = Math.max(0, Math.min(100, cmd.transitionTenths ?? 4));
    const num = (min: number, max: number) => {
      const v = Number(cmd.value);
      if (!Number.isFinite(v)) throw new MatterHubError('A numeric value is required');
      return Math.max(min, Math.min(max, v));
    };
    const run = (p: Promise<any>) => withTimeout(p, 15_000, `${cmd.command}`);

    switch (cmd.command) {
      case 'on': await run(client.commands.on()); break;
      case 'off': await run(client.commands.off()); break;
      case 'toggle': await run(client.commands.toggle()); break;
      case 'level':
        await run(client.commands.moveToLevelWithOnOff({ level: Math.round(num(0, 254)), transitionTime: tt, optionsMask: {}, optionsOverride: {} }));
        break;
      case 'colorTemp':
        await run(client.commands.moveToColorTemperature({ colorTemperatureMireds: Math.round(num(50, 1000)), transitionTime: tt, optionsMask: {}, optionsOverride: {} }));
        break;
      case 'heatSetpoint':
        await run(client.attributes.occupiedHeatingSetpoint.set(Math.round(num(-50, 60) * 100)));
        break;
      case 'coolSetpoint':
        await run(client.attributes.occupiedCoolingSetpoint.set(Math.round(num(-50, 60) * 100)));
        break;
      case 'setpointRaiseLower': {
        const M = c.clusters.ThermostatNs.SetpointRaiseLowerMode;
        const delta = Math.round(num(-12.7, 12.7) * 10); // amount is in 0.1 °C steps
        const feats = client.supportedFeatures || {};
        const mode = feats.heating && feats.cooling ? M.Both : feats.cooling ? M.Cool : M.Heat;
        await run(client.commands.setpointRaiseLower({ mode, amount: delta }));
        break;
      }
      case 'systemMode': {
        const id = SYSTEM_MODE_IDS[String(cmd.value)];
        if (id === undefined) throw new MatterHubError('systemMode must be off, auto, cool or heat');
        await run(client.attributes.systemMode.set(id));
        break;
      }
      case 'lock':
      case 'unlock': {
        const req = cmd.pin ? { pinCode: new TextEncoder().encode(String(cmd.pin)) } : {};
        const fn = cmd.command === 'lock' ? client.commands.lockDoor : client.commands.unlockDoor;
        await run(fn(req, { asTimedRequest: true, timedRequestTimeoutMs: 10_000 }));
        break;
      }
      default:
        throw new MatterHubError(`Unknown command ${(cmd as any).command}`);
    }
    // Read back from the device (subscription reports usually land within a second).
    await new Promise(r => setTimeout(r, 600));
    return readEndpoint(c, ep);
  }

  /** Decommission (removes our fabric from the device), falling back to forgetting it locally. */
  async removeNode(nodeIdRaw: string): Promise<{ removed: boolean; decommissioned: boolean; error?: string }> {
    const c = await ctx();
    const id = toNodeId(c, nodeIdRaw);
    if (!c.controller.isNodeCommissioned(id)) return { removed: false, decommissioned: false, error: 'not paired' };
    const node = await attachNode(c, id);
    try {
      await withTimeout(node.decommission(), 20_000, 'Decommission');
      c.nodes.delete(String(id));
      return { removed: true, decommissioned: true };
    } catch (e: any) {
      try { await c.controller.removeNode(id, false); } catch { /* already gone */ }
      c.nodes.delete(String(id));
      return { removed: true, decommissioned: false, error: e?.message || String(e) };
    }
  }

  /** Decode a pairing code without commissioning (for UI preview). */
  async parseCode(code: string) {
    const types: any = await import('@matter/types');
    const raw = String(code || '').trim();
    if (raw.toUpperCase().startsWith('MT:')) {
      const qr = types.QrPairingCodeCodec.decode(raw.toUpperCase())[0];
      return { kind: 'qr', discriminator: qr.discriminator, vendorId: qr.vendorId, productId: qr.productId, flowType: qr.flowType };
    }
    const digits = raw.replace(/[^0-9]/g, '');
    const m = types.ManualPairingCodeCodec.decode(digits);
    return { kind: 'manual', shortDiscriminator: m.shortDiscriminator, discriminator: m.discriminator, vendorId: m.vendorId, productId: m.productId };
  }
}
