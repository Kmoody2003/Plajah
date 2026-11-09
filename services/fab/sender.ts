// One way to drive a machine, whatever carries the bytes. Two implementations today:
//  - Web Serial (Chrome/Edge in the browser): the TS streamers in protocol.ts run in the page.
//  - The desktop bridge (WinUI app): the native side owns the serial port or TCP socket and streams
//    with the same algorithm (FabMachineStreamer.cs), so a busy or hidden page cannot starve the machine.
// The native message bus is injected so this file has no window dependency and is testable.

import { streamFor, flavorOf, GRBL_RT, parseGrblStatus, type Flavor, type GrblStatus, type LinePort, type RealtimeCmd, type StreamResult } from './protocol';

export interface RunOptions { onProgress?: (done: number, total: number) => void; onStatus?: (s: GrblStatus) => void; onLine?: (l: string) => void; safety: JobSafety }
/** What the person confirmed before starting. The bridge re-checks this natively. */
export interface JobSafety { energetic: boolean; hazardsAcknowledged: boolean; homingConfirmed: boolean }

export interface MachineSender {
  readonly kind: 'webserial' | 'bridge';
  readonly label: string;
  readonly flavor: Flavor;
  run(gcode: string, o: RunOptions): Promise<StreamResult>;
  /** Feed hold, resume, soft reset or a status query. Marlin/Klipper have no real-time channel: hold pauses sending. */
  realtime(cmd: RealtimeCmd): Promise<void>;
  /** Stop now: end streaming and halt the machine (GRBL: hold then soft reset; Marlin: quick stop, heaters off). */
  stop(): Promise<void>;
  close(): Promise<void>;
}

// ---- safety preflight ----
const ENERGETIC = /^(laser|plasma)/;
export const isEnergetic = (processId: string, dialect?: string) => ENERGETIC.test(processId) || dialect === 'grbl-laser' || dialect === 'plasma';
/** True when the program homes the machine itself (G28 on printers, $H on GRBL). */
export const programHomes = (gcode: string) => /^\s*(?:N\d+\s+)?(G28\b|\$H\b)/im.test(gcode);

export interface Preflight { blockers: string[]; reminders: string[] }
export function jobPreflight(i: { processId: string; dialect?: string; gcode: string; hazardsAcknowledged: boolean; homingConfirmed: boolean }): Preflight {
  const blockers: string[] = [], reminders: string[] = []; const energetic = isEnergetic(i.processId, i.dialect); const flavor = flavorOf(i.dialect);
  if (!i.hazardsAcknowledged) blockers.push(energetic ? 'Acknowledge the laser / plasma safety items above before this machine can start.' : 'Acknowledge the safety items above before starting.');
  if (!programHomes(i.gcode) && !i.homingConfirmed) blockers.push('Confirm the machine is homed, its limits are on and work zero is set: this program does not home itself.');
  if (programHomes(i.gcode)) reminders.push('This program homes first: keep hands and tools clear of the axes when it starts.');
  if (flavor === 'grbl') reminders.push('GRBL soft limits ($20=1) only protect you after homing ($22=1, $H).');
  if (energetic) reminders.push('Never leave a laser or plasma job running unattended. Eyewear rated for the beam, extraction on, extinguisher within reach.');
  reminders.push('If the connection drops, the job is not resumed automatically: check the machine and start again deliberately.');
  return { blockers, reminders };
}

// ---- Web Serial ----
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Wrap any LinePort (Web Serial today) as a MachineSender running the TS streamers. */
export function portSender(port: LinePort, flavor: Flavor, label: string): MachineSender {
  let signal = { stop: false, pause: false }; let poll: ReturnType<typeof setInterval> | null = null;
  const raw = async (b: number) => { if (port.writeRaw) await port.writeRaw(Uint8Array.of(b)); };
  return {
    kind: 'webserial', label, flavor,
    async run(gcode, o) {
      const pre = jobPreflight({ processId: o.safety.energetic ? 'laser' : 'other', gcode, hazardsAcknowledged: o.safety.hazardsAcknowledged, homingConfirmed: o.safety.homingConfirmed });
      if (pre.blockers.length) return { ok: false, message: pre.blockers.join(' '), sent: 0, total: 0, state: 'error' };
      signal = { stop: false, pause: false };
      if (flavor === 'grbl' && port.writeRaw) poll = setInterval(() => { void raw(GRBL_RT.status).catch(() => {}); }, 250);
      try { return await streamFor(flavor)(port, gcode, { ...o, signal }); } finally { if (poll) clearInterval(poll); poll = null; }
    },
    async realtime(cmd) {
      if (flavor === 'grbl') { await raw(GRBL_RT[cmd]); return; }
      if (cmd === 'hold') signal.pause = true; else if (cmd === 'resume') signal.pause = false; else if (cmd === 'reset') await this.stop();
    },
    async stop() {
      signal.stop = true; signal.pause = false;
      if (flavor === 'grbl') { await raw(GRBL_RT.hold); await sleep(300); await raw(GRBL_RT.reset); return; }
      for (const l of ['M410', 'M5', 'M104 S0', 'M140 S0', 'M107']) await port.write(l).catch(() => {});
    },
    close: () => { signal.stop = true; if (poll) clearInterval(poll); return port.close(); },
  };
}

/** A LinePort over the browser's Web Serial API (Chrome, Edge), with raw writes for GRBL real-time bytes. */
export async function openWebSerialPort(baud: number): Promise<LinePort> {
  const serial = (globalThis as any).navigator?.serial; if (!serial) throw new Error('This browser has no Web Serial. Use Chrome or Edge, or the desktop app.');
  const port = await serial.requestPort(); await port.open({ baudRate: baud });
  const enc = new TextEncoder(), dec = new TextDecoder(); const writer = port.writable.getWriter(); const reader = port.readable.getReader(); let buf = '';
  return {
    write: async line => { await writer.write(enc.encode(line + '\n')); },
    writeRaw: async bytes => { await writer.write(bytes); },
    readLine: async () => { for (;;) { const i = buf.indexOf('\n'); if (i >= 0) { const l = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); return l; } const { value, done } = await reader.read(); if (done) throw new Error('The machine disconnected. The job was not resumed.'); buf += dec.decode(value); } },
    close: async () => { try { reader.releaseLock(); writer.releaseLock(); } catch { /* already released */ } await port.close(); },
  };
}

// ---- Desktop bridge ----
export interface NativeBus { post(msg: object): void; on(handler: (m: any) => void): () => void }
export interface SerialDevice { port: string; name: string; driver?: string }
export interface LanDevice { name: string; host: string; port: number; service: 'octoprint' | 'moonraker' | 'fluidnc' | 'esp3d' | 'http' }
export interface BridgeDevices { serial: SerialDevice[]; lan: LanDevice[] }

const rid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
function request<T>(bus: NativeBus, msg: object & { type: string }, reply: string, match: (m: any) => boolean, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = bus.on(m => { if (m?.type === reply && match(m)) { clearTimeout(t); off(); resolve(m as T); } });
    const t = setTimeout(() => { off(); reject(new Error('The desktop app did not answer. Update Plajah for Windows to use machine control.')); }, ms);
    bus.post(msg);
  });
}

/** Serial ports, plus OctoPrint / Moonraker / FluidNC / ESP3D found on the network by mDNS. */
export async function listBridgeDevices(bus: NativeBus, scanLan = true): Promise<BridgeDevices> {
  const requestId = rid('fabls');
  const r = await request<any>(bus, { type: 'FAB_MACHINE_LIST', requestId, scanLan }, 'FAB_MACHINE_LIST_RESULT', m => m.requestId === requestId, 8000);
  return { serial: r.serial ?? [], lan: r.lan ?? [] };
}

export type BridgeTarget = { transport: 'serial'; port: string; baud: number } | { transport: 'tcp'; host: string; tcpPort: number };

/** Open a machine through the desktop app and drive it like any other sender. */
export async function openBridgeSender(bus: NativeBus, target: BridgeTarget, flavor: Flavor, label: string): Promise<MachineSender & { onDisconnect(cb: (duringJob: boolean) => void): void }> {
  const id = rid('fab');
  const r = await request<any>(bus, { type: 'FAB_MACHINE_OPEN', id, flavor, ...target }, 'FAB_MACHINE_OPEN_RESULT', m => m.id === id, 10000);
  if (!r.ok) throw new Error(r.error || 'Could not open the machine.');
  let disconnectCb: ((duringJob: boolean) => void) | null = null; let running: RunOptions | null = null;
  const off = bus.on(m => {
    if (m?.id !== id) return;
    if (m.type === 'FAB_MACHINE_PROGRESS') running?.onProgress?.(m.done, m.total);
    else if (m.type === 'FAB_MACHINE_STATUS') { const s = parseGrblStatus(String(m.raw ?? '')); if (s) running?.onStatus?.(s); }
    else if (m.type === 'FAB_MACHINE_LINE') running?.onLine?.(String(m.line ?? ''));
    else if (m.type === 'FAB_MACHINE_DISCONNECTED') disconnectCb?.(!!m.duringJob);
  });
  return {
    kind: 'bridge', label, flavor,
    async run(gcode, o) {
      const pre = jobPreflight({ processId: o.safety.energetic ? 'laser' : 'other', gcode, hazardsAcknowledged: o.safety.hazardsAcknowledged, homingConfirmed: o.safety.homingConfirmed });
      if (pre.blockers.length) return { ok: false, message: pre.blockers.join(' '), sent: 0, total: 0, state: 'error' };
      running = o;
      try {
        // No timeout: a job runs for hours. FAB_MACHINE_DONE always arrives, including on stop or disconnect.
        const d = await request<any>(bus, { type: 'FAB_MACHINE_RUN', id, gcode, flavor, safety: o.safety }, 'FAB_MACHINE_DONE', m => m.id === id, 7 * 24 * 3600_000);
        return { ok: !!d.ok, message: String(d.message ?? ''), sent: d.sent ?? 0, total: d.total ?? 0, resends: d.resends, state: d.state };
      } finally { running = null; }
    },
    async realtime(cmd) { bus.post({ type: 'FAB_MACHINE_RT', id, cmd }); },
    async stop() { bus.post({ type: 'FAB_MACHINE_STOP', id }); },
    async close() { off(); bus.post({ type: 'FAB_MACHINE_CLOSE', id }); },
    onDisconnect(cb) { disconnectCb = cb; },
  };
}
