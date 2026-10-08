/**
 * Plajah Home — Matter controller (server side).
 *
 * matter.js runs in services/home/matterCore.ts, either
 *  · in-process — on the Android TV hub (PLAJAH_HUB_PLATFORM=android: nodejs-mobile has no
 *    child_process) or when PLAJAH_MATTER_INPROCESS=1; or
 *  · in a child process (matterWorker.ts, forked with plain `node`) — the PC default, because the
 *    tsx dev loader makes the matter.js import graph take minutes. The worker is forked lazily on
 *    the first call, requests go over IPC with timeouts, and a dead worker is restarted.
 *
 * Discovery (`_matterc._udp` commissionable devices, `_matter._tcp` operational adverts) is plain
 * DNS-SD (homeMdns.ts) and runs here; it does not need matter.js.
 *
 * Nothing here fabricates a device or a state: every node comes from the controller's own fabric
 * and every value from the device.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hubDir } from './hubStorage';
import { browse } from './homeMdns';
import { MatterCore } from './matterCore';
import type {
  MatterEndpointState, MatterNodeInfo, CommissionableDeviceInfo, OperationalAdvert, MatterCommand,
} from './matterTypes';

export type { MatterEndpointState, MatterNodeInfo, CommissionableDeviceInfo, OperationalAdvert, MatterCommand } from './matterTypes';

export class MatterHubError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.name = 'MatterHubError'; this.status = status; }
}

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'matterWorker.ts');

type Pending = { resolve: (v: any) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> };

let child: ChildProcess | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let lastExit: string | null = null;

function startWorker(): ChildProcess {
  if (child && child.connected) return child;
  // Run with plain Node (type stripping), NOT under the tsx loader the dev server may use.
  const nodeOptions = (process.env.NODE_OPTIONS || '').split(/\s+/).filter(o => o && !/tsx/.test(o)).join(' ');
  const cp = fork(WORKER_PATH, [], {
    execArgv: ['--disable-warning=ExperimentalWarning'],
    env: { ...process.env, NODE_OPTIONS: nodeOptions, PLAJAH_MATTER_DIR: hubDir('matter') },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  cp.on('message', (msg: any) => {
    if (!msg || typeof msg.id !== 'number') return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new MatterHubError(msg.error || 'Matter worker error', msg.status || 500));
  });
  cp.on('exit', (code, signal) => {
    lastExit = `worker exited (code ${code}${signal ? `, ${signal}` : ''})`;
    if (child === cp) child = null;
    for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new MatterHubError(`Matter controller stopped: ${lastExit}`, 503)); pending.delete(id); }
  });
  cp.on('error', err => { lastExit = err.message; });
  child = cp;
  return cp;
}

const inProcess = () => process.env.PLAJAH_HUB_PLATFORM === 'android' || process.env.PLAJAH_MATTER_INPROCESS === '1';
let core: MatterCore | null = null;

function callInProcess<T>(method: string, args: any[], timeoutMs: number): Promise<T> {
  if (!core) core = new MatterCore();
  const fn = (core as any)[method];
  if (typeof fn !== 'function') return Promise.reject(new MatterHubError(`Unknown method ${method}`, 400));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new MatterHubError(`Matter controller did not answer ${method} within ${Math.round(timeoutMs / 1000)}s`, 504)), timeoutMs);
    Promise.resolve(fn.apply(core, args)).then(
      v => { clearTimeout(timer); resolve(JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))); },
      e => { clearTimeout(timer); reject(e instanceof Error && typeof (e as any).status === 'number' ? new MatterHubError(e.message, (e as any).status) : new MatterHubError(e?.message || String(e), 500)); },
    );
  });
}

function call<T>(method: string, args: any[] = [], timeoutMs = 30_000): Promise<T> {
  if (inProcess()) return callInProcess<T>(method, args, timeoutMs);
  const cp = startWorker();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new MatterHubError(`Matter controller did not answer ${method} within ${Math.round(timeoutMs / 1000)}s`, 504));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { cp.send({ id, method, args }); } catch (e: any) { clearTimeout(timer); pending.delete(id); reject(new MatterHubError(e?.message || 'IPC send failed', 503)); }
  });
}

export interface MatterStatus {
  running: boolean;
  storagePath?: string;
  controllerNodeId?: string | null;
  fabricLabel?: string;
  pairedNodes: string[];
  error?: string;
}

class MatterControllerService {
  /** Boots the controller (creates its fabric on first run) and reports it. */
  async status(): Promise<MatterStatus> {
    try {
      return await call<MatterStatus>('status', [], 60_000);
    } catch (e: any) {
      return { running: false, error: e?.message || lastExit || 'unknown', pairedNodes: [] };
    }
  }

  listNodes(): Promise<MatterNodeInfo[]> { return call('listNodes', [], 60_000); }
  getNode(nodeId: string): Promise<MatterNodeInfo> { return call('getNode', [nodeId], 30_000); }

  commission(opts: { code: string; knownAddress?: string; timeoutSeconds?: number }): Promise<MatterNodeInfo> {
    const t = Math.max(20, Math.min(180, opts.timeoutSeconds ?? 60));
    return call('commission', [{ ...opts, timeoutSeconds: t }], (t + 150) * 1000);
  }

  command(cmd: MatterCommand): Promise<MatterEndpointState> { return call('command', [cmd], 45_000); }
  removeNode(nodeId: string): Promise<{ removed: boolean; decommissioned: boolean; error?: string }> { return call('removeNode', [nodeId], 45_000); }
  parseCode(code: string): Promise<Record<string, unknown>> { return call('parseCode', [code], 30_000); }

  /** Real DNS-SD browse of `_matterc._udp` (devices with an open commissioning window). */
  async discoverCommissionable(seconds = 6): Promise<CommissionableDeviceInfo[]> {
    const found = await browse(['_matterc._udp'], Math.max(2, Math.min(30, seconds)) * 1000);
    return found.map(f => {
      const [vid, pid] = String(f.txt.VP || '').split('+').map(x => (x ? Number(x) : undefined));
      return {
        id: f.label,
        name: f.txt.DN || undefined,
        discriminator: Number(f.txt.D ?? NaN),
        commissioningMode: Number(f.txt.CM ?? 0),
        vendorId: vid, productId: pid,
        deviceType: f.txt.DT ? Number(f.txt.DT) : undefined,
        addresses: [...f.ipv4, ...f.ipv6].map(a => (a.includes(':') ? `[${a}]:${f.port ?? 5540}` : `${a}:${f.port ?? 5540}`)),
      };
    });
  }

  /** Operational Matter adverts on the LAN (any fabric): what exists, not what Plajah controls. */
  async operationalAdverts(seconds = 4): Promise<OperationalAdvert[]> {
    const [found, status] = await Promise.all([browse(['_matter._tcp'], seconds * 1000), this.started ? this.status() : Promise.resolve(null)]);
    const own = new Set((status?.pairedNodes || []).map(n => BigInt(n).toString(16).toUpperCase().padStart(16, '0')));
    return found.map(f => {
      const [fab, node] = f.label.split('-');
      return { compressedFabricId: fab, nodeId: node, host: f.host, port: f.port, ipv4: f.ipv4, ipv6: f.ipv6, ownFabric: own.has(String(node).toUpperCase()) };
    });
  }

  /** True once the controller has been started in this server process. */
  get started(): boolean { return inProcess() ? !!core : !!child; }

  /** Stop the controller (in-process) or the worker. */
  async shutdown(): Promise<void> {
    if (inProcess()) { const c = core; core = null; await c?.shutdown(); return; }
    const cp = child;
    if (!cp) return;
    try { await call('shutdown', [], 5000); } catch { /* already gone */ }
    try { cp.kill(); } catch { /* gone */ }
  }
}

export const matterControllerService = new MatterControllerService();
export default matterControllerService;
