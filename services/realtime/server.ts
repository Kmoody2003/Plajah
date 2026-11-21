// Plajah Realtime server: WebSocket rooms for fast online games (racing, tennis, fighting, shooters).
// Runs as its own Cloud Run service next to plajah-api (services/realtime/main.ts, deploy/Dockerfile).
//
//   client ──ws──▶ { t:'hello', ticket }        ticket signed by the API (routes/gamerRealtime.ts)
//          ◀────── { t:'welcome', seat, resume, players, phase, tickHz, serverNow }
//          ──────▶ { t:'ready', ready } · { t:'state', s:{…} } (20 Hz) · { t:'ping', c } · { t:'leave' }
//          ◀────── { t:'lobby' } · { t:'countdown', goAt } · { t:'go' } · { t:'tick', s:[…] } · { t:'finish' } · { t:'result' }
//
// No Firebase on the hot path: a join is one HMAC check. The finished result goes to the API signed with
// a server-to-server secret (resultPoster.ts); the API writes the ledger.

import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { realtimeGame, type RealtimeGameDef } from './games';
import { RelayRoom, type Peer, type RoomResult } from './room';
import { verifyTicket, resumeTicket } from './ticket';

export interface RealtimeServerOpts {
  port: number;
  host?: string;
  ticketSecret: string;
  /** Called once per finished room; resolve true when the API recorded it. */
  postResult(r: RoomResult): Promise<boolean>;
  now?: () => number;
  /** Override for tests (short lobby idle / result linger). */
  idleMs?: number;
  lingerMs?: number;
  log?: (msg: string) => void;
  /** Game lookup override (tests use a fast race). Defaults to the shared registry. */
  games?: (id: string) => RealtimeGameDef | null;
}

export interface RealtimeServer {
  http: Server;
  port: number;
  rooms: Map<string, RelayRoom>;
  close(): Promise<void>;
}

const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 10_000;

export function startRealtimeServer(o: RealtimeServerOpts): Promise<RealtimeServer> {
  const now = o.now ?? Date.now;
  const log = o.log ?? (() => {});
  const rooms = new Map<string, RelayRoom>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const http = createServer((req, res) => {
    if (req.url === '/healthz' || req.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 8 * 1024 });

  function dropRoom(id: string): void {
    const t = timers.get(id); if (t) clearInterval(t);
    timers.delete(id); rooms.delete(id);
  }

  function roomFor(id: string, gameId: string, min: number, rated: boolean): RelayRoom | null {
    const have = rooms.get(id);
    if (have && have.phase !== 'closed') return have;
    if (have) dropRoom(id);
    const def = (o.games ?? realtimeGame)(gameId); if (!def) return null;
    const room: RelayRoom = new RelayRoom({
      id, def, min: Math.max(def.minPlayers, Math.min(def.maxPlayers, min)), rated, now,
      idleMs: o.idleMs, lingerMs: o.lingerMs,
      resume: t => resumeTicket(t, o.ticketSecret, now()),
      onResult: r => {
        log(`room ${id} finished: ${r.standings.map(s => `${s.place}.${s.uid}`).join(' ')}`);
        o.postResult(r).then(ok => room.recorded(ok), () => room.recorded(false));
      },
    });
    rooms.set(id, room);
    timers.set(id, setInterval(() => {
      try { room.tick(); } catch (e) { log(`room ${id} tick error: ${String(e)}`); }
      if (room.phase === 'closed') dropRoom(id);
    }, room.tickMs));
    return room;
  }

  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const peer: Peer = {
      send: msg => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
      close: (code, reason) => { try { ws.close(code ?? 1000, reason); } catch { /* closed */ } },
    };
    let bound: { room: RelayRoom; seat: number } | null = null;
    const helloTimer = setTimeout(() => { if (!bound) peer.close(4000, 'no hello'); }, HELLO_TIMEOUT_MS);

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      let msg: any;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (bound) { bound.room.message(bound.seat, peer, msg); return; }
      if (msg?.t !== 'hello') return;
      const check = verifyTicket(msg.ticket, o.ticketSecret, now());
      if (check.ok === false) { peer.send({ t: 'error', code: `ticket-${check.reason}`, msg: 'Your join ticket is not valid — rejoin from the lobby' }); peer.close(4003, 'ticket'); return; }
      const t = check.ticket;
      const room = roomFor(t.room, t.game, t.min, t.rated);
      if (!room) { peer.send({ t: 'error', code: 'game', msg: 'Unknown game' }); peer.close(4004, 'game'); return; }
      const joined = room.join(t, peer);
      if (joined.ok === false) { peer.send({ t: 'error', code: joined.code, msg: joined.msg }); peer.close(4009, joined.code); return; }
      clearTimeout(helloTimer);
      bound = { room, seat: t.seat };
    });
    ws.on('close', () => { clearTimeout(helloTimer); if (bound) bound.room.leave(bound.seat, peer); });
    ws.on('error', () => { /* close follows */ });
  });

  // Cloud Run and proxies drop idle sockets; ping keeps them open and finds dead peers.
  const heartbeat = setInterval(() => {
    for (const c of wss.clients as Set<WebSocket & { alive?: boolean }>) {
      if (c.alive === false) { c.terminate(); continue; }
      c.alive = false; try { c.ping(); } catch { /* closing */ }
    }
  }, HEARTBEAT_MS);

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(o.port, o.host ?? '0.0.0.0', () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : o.port;
      log(`realtime listening on :${port}`);
      resolve({
        http, port, rooms,
        close: () => new Promise<void>(done => {
          clearInterval(heartbeat);
          for (const id of [...rooms.keys()]) { rooms.get(id)?.close('shutdown'); dropRoom(id); }
          for (const c of wss.clients) c.terminate();
          wss.close(() => http.close(() => done()));
        }),
      });
    });
  });
}
