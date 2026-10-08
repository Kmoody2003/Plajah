// bridge.ts — the Plajah Bridge core: a device registry, one link per device, and a WebSocket server the
// app talks to. Link factories are injected so tests run with no hardware.
//
// Security: this process can cut a live show and start camera recording, so (1) every client must present the
// pairing token, (2) a browser Origin that is not on the allow-list is refused (stops a random web page from
// driving the bridge through the visitor's browser), (3) camera paths are validated.

import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import {
  BRIDGE_PROTOCOL_VERSION, deviceId, type AtemSnapshot, type BmDevice, type BmDeviceKind, type BridgeEvent, type BridgeReply,
  type BridgeRequest, type CameraSnapshot, type IngestInfo, type IngestStream, type WithReqId,
} from '../../../services/mediaEngine/blackmagic/protocol.ts';

export interface AtemLike {
  connect(): Promise<void>; close(): Promise<void>; snapshot(): AtemSnapshot | null;
  cut(me?: number): Promise<void>; auto(me?: number): Promise<void>; program(i: number, me?: number): Promise<void>;
  preview(i: number, me?: number): Promise<void>; ftb(me?: number): Promise<void>;
  style(s: any, me?: number): Promise<void>; macro(i: number): Promise<void>; aux(bus: number, i: number): Promise<void>;
}
export interface CameraLike {
  connect(): Promise<void>; close(): void; snapshot(): CameraSnapshot;
  get(path: string): Promise<unknown>; put(path: string, body?: unknown): Promise<void>; record(on: boolean): Promise<void>;
}
export type LinkEvents = { link(state: 'connecting' | 'connected' | 'lost' | 'error', detail?: string): void };
export interface BridgeDeps {
  makeAtem(id: string, host: string, ev: LinkEvents & { snapshot(s: AtemSnapshot): void }): AtemLike;
  makeCamera(id: string, host: string, ev: LinkEvents & { snapshot(s: CameraSnapshot): void }): CameraLike;
}
export interface BridgeOptions {
  token: string;
  port: number;
  host?: string;
  allowedOrigins?: RegExp[];
  name?: string;
}

export const DEFAULT_ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?plajah\.(com|app)$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^capacitor:\/\/localhost$/, /^https?:\/\/localhost$/,
];

export class Bridge {
  readonly devices = new Map<string, BmDevice>();
  private atems = new Map<string, AtemLike>();
  private cameras = new Map<string, CameraLike>();
  private clients = new Set<WebSocket>();
  private wss: WebSocketServer | null = null;
  private ingest: { streams: IngestStream[]; info: IngestInfo } = { streams: [], info: { available: false, reason: 'Not checked yet' } };

  constructor(private deps: BridgeDeps, private o: BridgeOptions) {}

  // ── lifecycle ───────────────────────────────────────────────────────────────
  listen(): Promise<number> {
    return new Promise(resolve => {
      this.wss = new WebSocketServer({
        port: this.o.port, host: this.o.host ?? '0.0.0.0',
        verifyClient: ({ origin }: { origin?: string }) => this.originOk(origin),
      }, () => resolve((this.wss!.address() as any).port));
      this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    });
  }
  async close() {
    for (const a of this.atems.values()) await a.close();
    for (const c of this.cameras.values()) c.close();
    this.clients.forEach(c => c.close());
    await new Promise<void>(r => this.wss ? this.wss.close(() => r()) : r());
  }

  originOk(origin?: string): boolean {
    if (!origin) return true; // non-browser clients (native shells, CLI) send no Origin; they still need the token
    return (this.o.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS).some(re => re.test(origin));
  }

  // ── registry ────────────────────────────────────────────────────────────────
  /** A device was announced (mDNS) or typed in. Known devices only refresh; new ones are linked. */
  upsertDevice(d: BmDevice) {
    const prev = this.devices.get(d.id);
    if (prev) { this.devices.set(d.id, { ...prev, lastSeen: d.lastSeen, name: d.name || prev.name }); this.pushDevices(); return prev; }
    this.devices.set(d.id, d);
    this.pushDevices();
    void this.link(d);
    return d;
  }
  removeDevice(id: string) {
    const a = this.atems.get(id); if (a) { void a.close(); this.atems.delete(id); }
    const c = this.cameras.get(id); if (c) { c.close(); this.cameras.delete(id); }
    if (this.devices.delete(id)) this.pushDevices();
  }
  markDown(id: string) {
    const d = this.devices.get(id);
    if (d && (d.link === 'discovered')) { this.devices.set(id, { ...d, link: 'lost' }); this.pushDevices(); }
  }
  private setLink(id: string, link: BmDevice['link'], detail?: string) {
    const d = this.devices.get(id); if (!d) return;
    this.devices.set(id, { ...d, link, detail, lastSeen: Date.now() });
    this.pushDevices();
  }
  private async link(d: BmDevice) {
    if (d.kind === 'atem') {
      const a = this.deps.makeAtem(d.id, d.host, { link: (s, det) => this.setLink(d.id, s === 'connected' ? 'connected' : s, det), snapshot: s => this.broadcast({ evt: 'atem', snapshot: s }) });
      this.atems.set(d.id, a); await a.connect();
    } else if (d.kind === 'camera') {
      const c = this.deps.makeCamera(d.id, d.host, { link: (s, det) => this.setLink(d.id, s === 'connected' ? 'connected' : s, det), snapshot: s => this.broadcast({ evt: 'camera', snapshot: s }) });
      this.cameras.set(d.id, c); await c.connect();
    }
    // hyperdeck / videohub / phone / unknown: listed (so they can be seen and routed) but not linked yet.
  }
  setIngest(streams: IngestStream[], info: IngestInfo) {
    this.ingest = { streams, info };
    this.broadcast({ evt: 'ingest', streams, info });
  }
  deviceList() { return [...this.devices.values()]; }

  // ── wire ────────────────────────────────────────────────────────────────────
  private pushDevices() { this.broadcast({ evt: 'devices', devices: this.deviceList() }); }
  private broadcast(e: BridgeEvent) {
    const s = JSON.stringify(e);
    for (const c of this.clients) if ((c as any).authed && c.readyState === c.OPEN) c.send(s);
  }

  private onConnection(ws: WebSocket, _req: IncomingMessage) {
    (ws as any).authed = false;
    this.clients.add(ws);
    ws.send(JSON.stringify({ evt: 'hello', version: BRIDGE_PROTOCOL_VERSION, bridge: this.o.name ?? 'Plajah Bridge', host: this.o.host ?? '', authRequired: true } satisfies BridgeEvent));
    // An unauthenticated socket gets a short window, then is dropped.
    const t = setTimeout(() => { if (!(ws as any).authed) ws.close(4401, 'auth timeout'); }, 5000);
    ws.on('close', () => { clearTimeout(t); this.clients.delete(ws); });
    ws.on('message', async raw => {
      let req: WithReqId<BridgeRequest>;
      try { req = JSON.parse(String(raw)); } catch { return; }
      const reply = await this.handle(ws, req);
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(reply));
    });
  }

  async handle(ws: WebSocket | null, req: WithReqId<BridgeRequest>): Promise<BridgeReply> {
    const rid = req.rid;
    const fail = (error: string): BridgeReply => ({ rid, ok: false, error });
    try {
      if (req.op === 'hello') {
        if (!tokenEquals(req.token, this.o.token)) { if (ws) setTimeout(() => ws.close(4401, 'bad token'), 50); return fail('Pairing token rejected'); }
        if (ws) {
          (ws as any).authed = true;
          ws.send(JSON.stringify({ evt: 'devices', devices: this.deviceList() }));
          for (const a of this.atems.values()) { const s = a.snapshot(); if (s) ws.send(JSON.stringify({ evt: 'atem', snapshot: s })); }
          for (const c of this.cameras.values()) ws.send(JSON.stringify({ evt: 'camera', snapshot: c.snapshot() }));
          ws.send(JSON.stringify({ evt: 'ingest', ...this.ingest }));
        }
        return { rid, ok: true };
      }
      if (ws && !(ws as any).authed) return fail('Not paired');
      switch (req.op) {
        case 'devices.list': return { rid, ok: true, result: this.deviceList() };
        case 'ingest.info': return { rid, ok: true, result: this.ingest };
        case 'device.add': {
          const host = req.host.trim();
          if (!/^[a-z0-9.-]+$/i.test(host)) return fail('Not a valid host');
          const kind: BmDeviceKind = req.kind ?? 'atem';
          const d: BmDevice = { id: deviceId(kind, host), kind, name: `${kind.toUpperCase()} ${host}`, host, origin: 'manual', link: 'discovered', lastSeen: Date.now() };
          this.upsertDevice(d);
          return { rid, ok: true, result: d };
        }
        case 'device.remove': this.removeDevice(req.id); return { rid, ok: true };
        case 'atem.cut': await this.atem(req.id).cut(req.me); return { rid, ok: true };
        case 'atem.auto': await this.atem(req.id).auto(req.me); return { rid, ok: true };
        case 'atem.program': await this.atem(req.id).program(int(req.input), req.me); return { rid, ok: true };
        case 'atem.preview': await this.atem(req.id).preview(int(req.input), req.me); return { rid, ok: true };
        case 'atem.ftb': await this.atem(req.id).ftb(req.me); return { rid, ok: true };
        case 'atem.style': await this.atem(req.id).style(req.style, req.me); return { rid, ok: true };
        case 'atem.macro': await this.atem(req.id).macro(int(req.index)); return { rid, ok: true };
        case 'atem.aux': await this.atem(req.id).aux(int(req.bus), int(req.input)); return { rid, ok: true };
        case 'camera.get': return { rid, ok: true, result: await this.camera(req.id).get(req.path) };
        case 'camera.put': await this.camera(req.id).put(req.path, req.body); return { rid, ok: true };
        case 'camera.record': await this.camera(req.id).record(!!req.on); return { rid, ok: true };
        default: return fail('Unknown op');
      }
    } catch (e: any) { return fail(e?.message ?? String(e)); }
  }

  private atem(id: string) { const a = this.atems.get(id); if (!a) throw new Error('ATEM not connected'); return a; }
  private camera(id: string) { const c = this.cameras.get(id); if (!c) throw new Error('Camera not connected'); return c; }
}

function int(n: unknown) { const v = Number(n); if (!Number.isInteger(v) || v < 0 || v > 65535) throw new Error('Bad number'); return v; }

import { timingSafeEqual } from 'node:crypto';
export function tokenEquals(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
