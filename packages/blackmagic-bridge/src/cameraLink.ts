// cameraLink.ts — a Blackmagic camera via its REST + WebSocket control API.
//
// Cameras with the web media manager enabled (Blackmagic Camera Setup > network access) serve
//   REST:  http://<host>/control/api/v1/<path>        (GET reads, PUT writes JSON)
//   WS:    ws://<host>/control/api/v1/event/websocket
// The socket messages below (listProperties, subscribe, propertyValueChanged) follow Blackmagic's REST API
// as used by an open-source client. They have NOT been run against a physical camera from here, so every
// field is read defensively.

import WebSocket from 'ws';
import type { CameraSnapshot } from '../../../services/mediaEngine/blackmagic/protocol.ts';

export interface CameraLinkEvents {
  snapshot(s: CameraSnapshot): void;
  link(state: 'connecting' | 'connected' | 'lost' | 'error', detail?: string): void;
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export class CameraLink {
  private ws: WebSocket | null = null;
  private props: Record<string, unknown> = {};
  private available: string[] = [];
  private closed = false;
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private emitTimer: NodeJS.Timeout | null = null;
  private readonly base: string;
  private readonly wsUrl: string;

  constructor(readonly deviceId: string, readonly host: string, private ev: CameraLinkEvents, private fetchImpl: typeof fetch = fetch) {
    this.base = `http://${host}/control/api/v1`;
    this.wsUrl = `ws://${host}/control/api/v1/event/websocket`;
  }

  async connect() { this.open(); }
  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.ws?.close();
  }

  private open() {
    if (this.closed) return;
    this.ev.link('connecting');
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.on('open', () => {
      this.attempt = 0;
      this.ev.link('connected');
      ws.send(JSON.stringify({ type: 'request', data: { action: 'listProperties' } }));
    });
    ws.on('message', raw => this.onMessage(String(raw)));
    ws.on('close', () => {
      if (this.closed) return;
      this.ev.link('lost', 'Camera control socket closed; retrying');
      this.timer = setTimeout(() => this.open(), BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]);
    });
    ws.on('error', e => this.ev.link('error', (e as Error).message));
  }

  onMessage(raw: string) {
    let m: any; try { m = JSON.parse(raw); } catch { return; }
    const data = m?.data;
    if (!data) return;
    if (data.action === 'listProperties' && Array.isArray(data.properties)) {
      this.available = data.properties.map(String);
      this.ws?.send(JSON.stringify({ type: 'request', data: { action: 'subscribe', properties: this.available } }));
    }
    if (m.type === 'response' && data.values && typeof data.values === 'object') Object.assign(this.props, data.values);
    if (data.action === 'propertyValueChanged' && typeof data.property === 'string') this.props[data.property] = data.value;
    this.scheduleEmit();
  }

  private scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.ev.snapshot(this.snapshot()); }, 50);
  }

  snapshot(): CameraSnapshot {
    const rec = (this.props['/transports/0/record'] as any)?.recording;
    return { deviceId: this.deviceId, recording: typeof rec === 'boolean' ? rec : undefined, props: { ...this.props }, available: [...this.available] };
  }

  private url(path: string) {
    if (!path.startsWith('/') || path.includes('..')) throw new Error('Invalid camera path');
    return this.base + path;
  }
  async get(path: string): Promise<unknown> {
    const r = await this.fetchImpl(this.url(path), { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`Camera answered ${r.status}`);
    return r.json();
  }
  async put(path: string, body?: unknown): Promise<void> {
    const r = await this.fetchImpl(this.url(path), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`Camera answered ${r.status}`);
  }
  record(on: boolean) { return this.put('/transports/0/record', { recording: on }); }
}
