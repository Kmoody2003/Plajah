// ─── Relay client (NIP-01 over websockets) ────────────────────────────────────
// Short-lived connections: open, do one thing (publish, or REQ until EOSE), close. Plajah never runs a relay.
// Uses Node's global WebSocket (Node 22+; this repo runs 24). Tests inject a fake socket factory.

import { verifyEvent, type NostrEvent } from './event';

export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://relay.wavlake.com'];
export const MAX_RELAYS = 8;

export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
}
export type SocketFactory = (url: string) => SocketLike;

export const defaultSocketFactory: SocketFactory = (url) => {
  const WS = (globalThis as any).WebSocket;
  if (!WS) throw new Error('No WebSocket implementation (needs Node 22+)');
  return new WS(url) as SocketLike;
};

/** Keep only wss:// relay URLs on public hostnames; dedupe; cap. */
export function sanitizeRelays(input: unknown, fallback = DEFAULT_RELAYS): string[] {
  const list = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.length > 200) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol !== 'wss:' || u.username || u.password) continue;
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) continue;
      const norm = `wss://${h}${u.port ? ':' + u.port : ''}${u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')}`;
      if (!out.includes(norm)) out.push(norm);
    } catch { /* skip */ }
    if (out.length >= MAX_RELAYS) break;
  }
  return out.length ? out : [...fallback];
}

export interface PublishResult { relay: string; ok: boolean; message: string }
export interface Filter { ids?: string[]; authors?: string[]; kinds?: number[]; since?: number; until?: number; limit?: number; [tag: `#${string}`]: string[] | undefined }

export class RelayPool {
  constructor(private factory: SocketFactory = defaultSocketFactory) {}

  /** Send ["EVENT", e] to each relay and wait for ["OK", id, bool, msg] (or time out). */
  publish(event: NostrEvent, relays: string[], timeoutMs = 7000): Promise<PublishResult[]> {
    return Promise.all(relays.map(relay => new Promise<PublishResult>((resolve) => {
      let done = false, ws: SocketLike | null = null;
      const finish = (ok: boolean, message: string) => {
        if (done) return; done = true; clearTimeout(timer);
        try { ws?.close(); } catch { /* ignore */ }
        resolve({ relay, ok, message });
      };
      const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
      try { ws = this.factory(relay); } catch (e: any) { return finish(false, `connect failed: ${e?.message || e}`); }
      ws.onopen = () => { try { ws!.send(JSON.stringify(['EVENT', event])); } catch (e: any) { finish(false, `send failed: ${e?.message || e}`); } };
      ws.onmessage = (ev) => {
        let msg: any; try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (Array.isArray(msg) && msg[0] === 'OK' && msg[1] === event.id) finish(msg[2] === true, String(msg[3] ?? ''));
        else if (Array.isArray(msg) && msg[0] === 'NOTICE') { /* informational; keep waiting for OK */ }
      };
      ws.onerror = () => finish(false, 'connection error');
      ws.onclose = () => finish(false, 'closed before OK');
    })));
  }

  /** REQ the filters on every relay; resolve with verified, de-duplicated events once all relays EOSE or time out. */
  query(filters: Filter[], relays: string[], opts: { timeoutMs?: number; maxEvents?: number; verify?: boolean } = {}): Promise<NostrEvent[]> {
    const timeoutMs = opts.timeoutMs ?? 6000, max = opts.maxEvents ?? 500, verify = opts.verify !== false;
    const seen = new Map<string, NostrEvent>();
    const subId = `plj${Math.random().toString(36).slice(2, 10)}`;
    return Promise.all(relays.map(relay => new Promise<void>((resolve) => {
      let done = false, ws: SocketLike | null = null;
      const finish = () => {
        if (done) return; done = true; clearTimeout(timer);
        try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(['CLOSE', subId])); } catch { /* ignore */ }
        try { ws?.close(); } catch { /* ignore */ }
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      try { ws = this.factory(relay); } catch { return finish(); }
      ws.onopen = () => { try { ws!.send(JSON.stringify(['REQ', subId, ...filters])); } catch { finish(); } };
      ws.onmessage = (ev) => {
        let msg: any; try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (!Array.isArray(msg) || msg[1] !== subId) return;
        if (msg[0] === 'EVENT') {
          const e = msg[2];
          if (seen.size >= max || !e || seen.has(e.id)) return;
          if (verify ? verifyEvent(e) : true) seen.set(e.id, e);
        } else if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') finish();
      };
      ws.onerror = finish;
      ws.onclose = finish;
    }))).then(() => [...seen.values()].sort((a, b) => b.created_at - a.created_at));
  }
}
