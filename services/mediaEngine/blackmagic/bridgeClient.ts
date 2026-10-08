// mediaEngine/blackmagic/bridgeClient.ts — the app's connection to the Plajah Bridge (see protocol.ts).
// React-free. WebSocket + request/reply + automatic reconnect with backoff. The WebSocket constructor and
// timers are injectable so tests run without a network.

import {
  isReply, type BridgeEvent, type BridgeMessage, type BridgeRequest, type WithReqId, DEFAULT_BRIDGE_PORT,
} from './protocol';
import { hmacHex, roomIdFor } from './auth';

export type ClientState = 'idle' | 'connecting' | 'pairing' | 'ready' | 'retrying' | 'rejected' | 'waiting-bridge';

export interface BridgeConfig { url: string; token: string }
export const defaultBridgeUrl = () => `ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;
/** The hosted relay path: a url ending in this is a relay, not a bridge, and gets room/role params appended. */
export const RELAY_SUFFIX = '/api/bm-relay';
export const relayUrlForOrigin = (origin: string) => origin.replace(/^http/, 'ws') + RELAY_SUFFIX;
export const isRelayUrl = (u: string) => u.split('?')[0].endsWith(RELAY_SUFFIX);

/** Remove a distribution of "Omit" over a union so each request keeps its own shape. */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<BridgeRequest, never>;

export interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((e: any) => void) | null;
  onmessage: ((e: { data: any }) => void) | null;
  onclose: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
}
export interface BridgeClientDeps {
  makeSocket?: (url: string) => WsLike;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export class BridgeClient {
  private ws: WsLike | null = null;
  private rid = 0;
  private pending = new Map<number, { res(v: unknown): void; rej(e: Error): void; timer: unknown }>();
  private eventCbs = new Set<(e: BridgeEvent) => void>();
  private stateCbs = new Set<(s: ClientState, detail?: string) => void>();
  private attempt = 0;
  private retryTimer: unknown = null;
  private opening = false;
  private relay = false;
  private wanted = false;
  state: ClientState = 'idle';
  detail?: string;

  constructor(private cfg: BridgeConfig, private deps: BridgeClientDeps = {}) {}

  private setT(fn: () => void, ms: number) { return (this.deps.setTimeout ?? ((f, m) => setTimeout(f, m)))(fn, ms); }
  private clearT(h: unknown) { (this.deps.clearTimeout ?? (x => clearTimeout(x as any)))(h); }

  onEvent(cb: (e: BridgeEvent) => void) { this.eventCbs.add(cb); return () => { this.eventCbs.delete(cb); }; }
  onState(cb: (s: ClientState, detail?: string) => void) { this.stateCbs.add(cb); return () => { this.stateCbs.delete(cb); }; }
  private setState(s: ClientState, detail?: string) { this.state = s; this.detail = detail; this.stateCbs.forEach(cb => cb(s, detail)); }

  connect() {
    this.wanted = true;
    if (this.ws || this.opening) return;
    this.opening = true;
    this.setState('connecting');
    void this.resolveUrl().then(url => {
      this.opening = false;
      if (!this.wanted) return;
      this.openSocket(url);
    }, (e: Error) => { this.opening = false; this.setState('rejected', e.message); this.wanted = false; });
  }

  private async resolveUrl(): Promise<string> {
    if (!isRelayUrl(this.cfg.url)) return this.cfg.url;
    if (!this.cfg.token) throw new Error('Enter the pairing token first; it selects your relay room.');
    this.relay = true;
    const room = await roomIdFor(this.cfg.token);
    return `${this.cfg.url}${this.cfg.url.includes('?') ? '&' : '?'}room=${room}&role=app`;
  }

  private openSocket(url: string) {
    let ws: WsLike;
    try { ws = (this.deps.makeSocket ?? (u => new WebSocket(u) as unknown as WsLike))(url); }
    catch (e: any) { this.setState('retrying', e?.message ?? 'Could not open the connection'); this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.setState(this.relay ? 'waiting-bridge' : 'pairing', this.relay ? 'Connected to the relay; waiting for the bridge' : undefined); };
    ws.onmessage = e => {
      let m: any; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (this.relay) {
        if (m.relay === 'bridge-down') { this.pending.forEach(p => { this.clearT(p.timer); p.rej(new Error('Bridge went offline')); }); this.pending.clear(); this.setState('waiting-bridge', 'The relay is up but the bridge is not connected to it'); return; }
        if (m.relay === 'bridge-up') return;
        if (typeof m.m !== 'string') return;
        try { m = JSON.parse(m.m); } catch { return; }
      }
      this.onBridgeMessage(m as BridgeMessage);
    };
    ws.onclose = () => this.onClosed();
    ws.onerror = () => { /* onclose follows; the retry path reports it */ };
  }

  private onBridgeMessage(m: BridgeMessage) {
    if (isReply(m)) {
      const p = this.pending.get(m.rid); if (!p) return;
      this.pending.delete(m.rid); this.clearT(p.timer);
      if (m.ok) p.res(m.result); else p.rej(new Error((m as { error: string }).error));
      return;
    }
    const ev = m as BridgeEvent;
    if (ev.evt === 'hello') { void this.pair(ev.nonce); return; }
    this.eventCbs.forEach(cb => cb(ev));
  }

  /** Answer the bridge's nonce with HMAC(token, nonce); the token itself is never sent. */
  private async pair(nonce: string) {
    this.setState('pairing');
    try {
      const proof = await hmacHex(this.cfg.token, nonce);
      await this.request({ op: 'hello', proof, client: 'plajah-app' });
      this.attempt = 0; this.setState('ready');
    } catch (e: any) {
      this.setState('rejected', e?.message ?? 'Pairing failed'); this.wanted = false; this.ws?.close();
    }
  }

  private onClosed() {
    this.ws = null;
    this.pending.forEach(p => { this.clearT(p.timer); p.rej(new Error('Bridge connection closed')); });
    this.pending.clear();
    if (this.state === 'rejected' || !this.wanted) { if (this.state !== 'rejected') this.setState('idle'); return; }
    this.setState('retrying', 'Bridge not reachable; is Plajah Bridge running on this network?');
    this.scheduleRetry();
  }
  private scheduleRetry() {
    if (this.retryTimer !== null) return;
    this.retryTimer = this.setT(() => { this.retryTimer = null; this.connect(); }, BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]);
  }

  disconnect() {
    this.wanted = false;
    if (this.retryTimer !== null) { this.clearT(this.retryTimer); this.retryTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.setState('idle');
  }

  request<T = unknown>(body: RequestBody, timeoutMs = 6000): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return Promise.reject(new Error('Not connected to the bridge'));
    const rid = ++this.rid;
    return new Promise<T>((res, rej) => {
      const timer = this.setT(() => { this.pending.delete(rid); rej(new Error('Bridge did not answer')); }, timeoutMs);
      this.pending.set(rid, { res: res as (v: unknown) => void, rej, timer });
      ws.send(JSON.stringify({ rid, ...body } satisfies WithReqId<BridgeRequest>));
    });
  }
}
