// mediaEngine/blackmagic/bridgeClient.ts — the app's connection to the Plajah Bridge (see protocol.ts).
// React-free. WebSocket + request/reply + automatic reconnect with backoff. The WebSocket constructor and
// timers are injectable so tests run without a network.

import {
  isReply, type BridgeEvent, type BridgeMessage, type BridgeRequest, type WithReqId, DEFAULT_BRIDGE_PORT,
} from './protocol';

export type ClientState = 'idle' | 'connecting' | 'pairing' | 'ready' | 'retrying' | 'rejected';

export interface BridgeConfig { url: string; token: string }
export const defaultBridgeUrl = () => `ws://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

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
    if (this.ws) return;
    this.setState('connecting');
    let ws: WsLike;
    try { ws = (this.deps.makeSocket ?? (u => new WebSocket(u) as unknown as WsLike))(this.cfg.url); }
    catch (e: any) { this.setState('retrying', e?.message ?? 'Could not open the connection'); this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.setState('pairing');
      this.request({ op: 'hello', token: this.cfg.token, client: 'plajah-app' }).then(
        () => { this.attempt = 0; this.setState('ready'); },
        (e: Error) => { this.setState('rejected', e.message); this.wanted = false; ws.close(); },
      );
    };
    ws.onmessage = e => {
      let m: BridgeMessage; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (isReply(m)) {
        const p = this.pending.get(m.rid); if (!p) return;
        this.pending.delete(m.rid); this.clearT(p.timer);
        if (m.ok) p.res(m.result); else p.rej(new Error((m as { error: string }).error));
      } else this.eventCbs.forEach(cb => cb(m as BridgeEvent));
    };
    ws.onclose = () => this.onClosed();
    ws.onerror = () => { /* onclose follows; the retry path reports it */ };
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
