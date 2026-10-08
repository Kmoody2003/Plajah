// relayLink.ts — lets phones and remote browsers reach this bridge through the Plajah relay
// (services/bmRelayServer.ts). The bridge dials OUT (works behind NAT, no port forwarding), and each app that
// joins the same room appears here as a virtual socket handed to Bridge.attach(), so the very same
// nonce/HMAC pairing applies as for a direct connection. Opt-in: only runs when a relay URL is configured.

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { roomIdFor } from '../../../services/mediaEngine/blackmagic/auth.ts';
import type { Bridge, SocketLike } from './bridge.ts';

const BACKOFF = [2000, 4000, 8000, 15000, 30000];

class VirtualSocket extends EventEmitter implements SocketLike {
  readonly OPEN = 1;
  readyState = 1;
  constructor(private id: string, private sendFrame: (f: object) => void) { super(); }
  send(data: string) { if (this.readyState === 1) this.sendFrame({ c: this.id, m: data }); }
  close() { if (this.readyState !== 1) return; this.readyState = 3; this.emit('close'); }
  /** Relay-side events. */
  deliver(raw: string) { this.emit('message', raw); }
}

export class RelayLink {
  private ws: WebSocket | null = null;
  private clients = new Map<string, VirtualSocket>();
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  state: 'idle' | 'connecting' | 'up' | 'down' = 'idle';

  constructor(private bridge: Bridge, private relayUrl: string, private token: string, private onState: (s: RelayLink['state'], detail?: string) => void = () => {}) {}

  async start() {
    const room = await roomIdFor(this.token);
    this.open(`${this.relayUrl}${this.relayUrl.includes('?') ? '&' : '?'}room=${room}&role=bridge`);
  }

  private open(url: string) {
    if (this.closed) return;
    this.state = 'connecting'; this.onState('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on('open', () => { this.attempt = 0; this.state = 'up'; this.onState('up'); });
    ws.on('message', raw => this.onFrame(String(raw)));
    ws.on('error', e => this.onState('down', (e as Error).message));
    ws.on('close', () => {
      this.clients.forEach(c => c.close());
      this.clients.clear();
      if (this.closed) return;
      this.state = 'down'; this.onState('down', 'Relay connection closed; retrying');
      this.timer = setTimeout(() => this.open(url), BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]);
    });
  }

  private onFrame(raw: string) {
    let f: { c?: string; m?: string; gone?: boolean; joined?: boolean }; try { f = JSON.parse(raw); } catch { return; }
    if (typeof f.c !== 'string') return;
    const id = f.c;
    if (f.gone) { this.clients.get(id)?.close(); this.clients.delete(id); return; }
    if (f.joined) { this.join(id); return; }
    if (typeof f.m !== 'string') return;
    (this.clients.get(id) ?? this.join(id)).deliver(f.m);
  }

  /** A new app arrived: greet it (Bridge.attach sends the pairing nonce). */
  private join(id: string): VirtualSocket {
    this.clients.get(id)?.close();
    const v = new VirtualSocket(id, frame => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame)); });
    v.on('close', () => { if (this.clients.get(id) === v) this.clients.delete(id); });
    this.clients.set(id, v);
    this.bridge.attach(v, 'relay');
    return v;
  }

  stop() { this.closed = true; if (this.timer) clearTimeout(this.timer); this.ws?.close(); }
}
