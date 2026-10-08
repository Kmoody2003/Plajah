// services/bmRelayServer.ts — rendezvous relay so a phone (an https page that cannot open ws://<LAN address>)
// can reach a Plajah Bridge on the switcher computer. Both sides dial OUT to /api/bm-relay:
//   bridge: ?room=<id>&role=bridge     app: ?room=<id>&role=app
// The room id is sha256("plajah-bm-room:" + pairing token), so the token never reaches this server, and
// the bridge still demands an HMAC proof of the token (see bridge.ts) before it obeys anyone, so knowing a
// room id alone gives no control. Commands do pass through here in clear (inside TLS to the relay); the relay
// stores nothing and only forwards.
//
// Framing: the relay multiplexes many apps over the bridge's single socket.
//   app -> bridge:   {"c":"<clientId>","m":"<raw message>"}, plus {"c":..,"joined":true} / {"c":..,"gone":true}
//                    so the bridge can greet each app with its pairing nonce
//   bridge -> app:   {"c":"<clientId>"|"*","m":"<raw message>"}   ("*" = every app in the room)
//   relay -> app:    {"relay":"bridge-up"|"bridge-down"}
//
// Limits (this is an unauthenticated internet endpoint): 64 KB frames, 4 apps per room, 1000 rooms, 40 msg/s
// per socket, 90 s without a pong closes the socket, strict room-id format, browser Origin allow-list for apps.

// @ts-ignore -- `ws` ships no types at the repo root; the bridge package has @types/ws
import { WebSocketServer } from 'ws';
type WebSocket = any;
import type { IncomingMessage, Server } from 'node:http';
import { randomBytes } from 'node:crypto';

export const RELAY_PATH = '/api/bm-relay';
const ROOM_RE = /^[0-9a-f]{64}$/;
const MAX_ROOMS = 1000;
const MAX_APPS = 4;
const MAX_FRAME = 64 * 1024;
const RATE_PER_SEC = 40;
const ORIGIN_OK = [/^https:\/\/(www\.)?plajah\.(com|app)$/, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^capacitor:\/\/localhost$/, /^https?:\/\/localhost$/];

interface Room { bridge: WebSocket | null; apps: Map<string, WebSocket> }

export function attachBmRelay(server: Server, opts: { allowedOrigins?: RegExp[] } = {}) {
  const rooms = new Map<string, Room>();
  const origins = opts.allowedOrigins ?? ORIGIN_OK;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    let url: URL;
    try { url = new URL(req.url ?? '', 'http://x'); } catch { return; }
    if (url.pathname !== RELAY_PATH) return; // other upgrade handlers (if any) own their paths
    const room = url.searchParams.get('room') ?? '';
    const role = url.searchParams.get('role');
    const origin = req.headers.origin;
    const bad = !ROOM_RE.test(room) || (role !== 'bridge' && role !== 'app')
      || (role === 'app' && origin && !origins.some(re => re.test(origin)));
    if (bad) { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    if (!rooms.has(room) && rooms.size >= MAX_ROOMS) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => join(ws, room, role as 'bridge' | 'app'));
  });

  function join(ws: WebSocket, roomId: string, role: 'bridge' | 'app') {
    let room = rooms.get(roomId);
    if (!room) { room = { bridge: null, apps: new Map() }; rooms.set(roomId, room); }
    const r = room;
    const rate = makeRateLimiter();
    let alive = true;
    ws.on('pong', () => { alive = true; });
    const beat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; try { ws.ping(); } catch { /* closing */ } }, 45_000);

    if (role === 'bridge') {
      r.bridge?.close(4000, 'replaced by a newer bridge');
      r.bridge = ws;
      for (const [id, a] of r.apps) { a.send(JSON.stringify({ relay: 'bridge-up' })); ws.send(JSON.stringify({ c: id, joined: true })); }
      ws.on('message', (raw: unknown) => {
        if (!rate()) return ws.close(4429, 'too fast');
        let f: { c?: string; m?: string }; try { f = JSON.parse(String(raw)); } catch { return; }
        if (typeof f.m !== 'string') return;
        if (f.c === '*') for (const a of r.apps.values()) a.send(JSON.stringify({ m: f.m }));
        else if (typeof f.c === 'string') r.apps.get(f.c)?.send(JSON.stringify({ m: f.m }));
      });
      ws.on('close', () => {
        clearInterval(beat);
        if (r.bridge === ws) { r.bridge = null; for (const a of r.apps.values()) a.send(JSON.stringify({ relay: 'bridge-down' })); }
        prune(roomId);
      });
      return;
    }

    if (r.apps.size >= MAX_APPS) { ws.close(4003, 'room full'); clearInterval(beat); return; }
    const id = randomBytes(6).toString('hex');
    r.apps.set(id, ws);
    ws.send(JSON.stringify({ relay: r.bridge ? 'bridge-up' : 'bridge-down' }));
    if (bridgeOpen(r)) r.bridge!.send(JSON.stringify({ c: id, joined: true }));
    ws.on('message', (raw: unknown) => {
      if (!rate()) return ws.close(4429, 'too fast');
      if (bridgeOpen(r)) r.bridge!.send(JSON.stringify({ c: id, m: String(raw) }));
    });
    ws.on('close', () => {
      clearInterval(beat);
      r.apps.delete(id);
      if (bridgeOpen(r)) r.bridge!.send(JSON.stringify({ c: id, gone: true }));
      prune(roomId);
    });
  }

  /** The bridge socket is present AND open (a null bridge must not compare equal to itself). */
  function bridgeOpen(r: Room): boolean { return !!r.bridge && r.bridge.readyState === 1; }

  function prune(id: string) { const r = rooms.get(id); if (r && !r.bridge && r.apps.size === 0) rooms.delete(id); }
  return { wss, roomCount: () => rooms.size, close: () => wss.close() };
}

function makeRateLimiter() {
  let windowStart = Date.now(), n = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; n = 0; }
    return ++n <= RATE_PER_SEC;
  };
}
