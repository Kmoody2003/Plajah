// Generic realtime relay room — transport-agnostic so tests drive it with fake peers and a fake clock.
//
//   lobby ──(everyone connected is ready, ≥ min players)──▶ countdown ──(goAt)──▶ running ──(referee done)──▶ finished
//     ▲                                   │ someone unreadies / leaves below min
//     └───────────────────────────────────┘
//
// The room relays each player's latest state to the others at the game's tick rate (only states that
// changed since the last tick, plus a full snapshot once a second), keeps seats for a reconnect grace
// window, and hands the referee's standings to `onResult` exactly once. It never trusts a client result.

import type { RealtimeGameDef, RoomMeta } from './games';
import type { PlayerState, Referee, Standing } from './referee';
import type { TicketPayload } from './ticket';

export interface Peer { send(msg: unknown): void; close(code?: number, reason?: string): void }

export type Phase = 'lobby' | 'countdown' | 'running' | 'finished' | 'closed';

export interface RoomResult {
  matchId: string;
  game: string;
  rated: boolean;
  startedAt: number;
  endedAt: number;
  standings: Array<Standing & { uid: string; name: string }>;
}

interface Seat {
  seat: number; uid: string; name: string;
  peer: Peer | null; ready: boolean; leftAt: number;
  state: PlayerState | null; dirty: boolean; racing: boolean;
  winStart: number; winCount: number; floods: number;
}

export interface RoomOpts {
  id: string;
  def: RealtimeGameDef;
  min: number;
  rated: boolean;
  /** Optional flat room metadata (e.g. circuitId, region), broadcast in welcome & lobby. */
  meta?: RoomMeta;
  now: () => number;
  onResult(r: RoomResult): void;
  /** Mint a resume ticket for a seat (server wires ticket.resumeTicket). */
  resume?(t: TicketPayload): string;
  /** Close the room after this long with nobody connected (lobby) / after the result is out. */
  idleMs?: number;
  lingerMs?: number;
}

export type JoinOut = { ok: true } | { ok: false; code: 'started' | 'full' | 'seat' | 'game' | 'closed'; msg: string };

const MAX_KEYS = 24;

/** Keep only flat number/boolean/short-string fields; reject anything bigger than the game allows. */
export function cleanState(raw: unknown, maxBytes: number): PlayerState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: PlayerState = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (++n > MAX_KEYS || k.length > 24) return null;
    if (typeof v === 'number') { if (!Number.isFinite(v)) return null; out[k] = Math.round(v * 1000) / 1000; }
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 48) out[k] = v;
    else return null;
  }
  return JSON.stringify(out).length <= maxBytes ? out : null;
}

export class RelayRoom {
  readonly id: string;
  readonly def: RealtimeGameDef;
  readonly meta?: RoomMeta;
  phase: Phase = 'lobby';
  goAt = 0;
  startedAt = 0;
  private seats = new Map<number, Seat>();
  private referee: Referee;
  private tickN = 0;
  private emptySince: number;
  private finishedAt = 0;
  private result: RoomResult | null = null;
  private readonly hz: number;

  constructor(private opts: RoomOpts) {
    this.id = opts.id; this.def = opts.def; this.meta = opts.meta;
    this.referee = opts.def.referee(opts.meta);
    this.hz = Math.max(5, Math.min(60, opts.def.tickHz));
    this.emptySince = opts.now();
  }

  get tickMs(): number { return 1000 / this.hz; }
  get connected(): number { let n = 0; for (const s of this.seats.values()) if (s.peer) n++; return n; }

  private roster() {
    return [...this.seats.values()].sort((a, b) => a.seat - b.seat)
      .map(s => ({ seat: s.seat, uid: s.uid, name: s.name, ready: s.ready, connected: !!s.peer }));
  }
  private broadcast(msg: unknown, except?: number): void {
    for (const s of this.seats.values()) if (s.peer && s.seat !== except) s.peer.send(msg);
  }
  private lobbyUpdate(): void {
    this.broadcast({ t: 'lobby', phase: this.phase, players: this.roster(), min: this.opts.min, goAt: this.goAt || undefined, ...(this.meta ? { meta: this.meta } : {}) });
  }

  join(t: TicketPayload, peer: Peer): JoinOut {
    const now = this.opts.now();
    if (this.phase === 'closed') return { ok: false, code: 'closed', msg: 'This room has closed' };
    if (t.game !== this.def.id) return { ok: false, code: 'game', msg: 'Ticket is for another game' };
    let s = this.seats.get(t.seat);
    if (s && s.uid !== t.uid) return { ok: false, code: 'seat', msg: 'That seat belongs to another player' };
    for (const o of this.seats.values()) if (o.uid === t.uid && o.seat !== t.seat) return { ok: false, code: 'seat', msg: 'You already hold another seat' };
    if (!s) {
      const canDropIn = !!this.def.dropIn && (this.phase === 'running' || this.phase === 'countdown');
      if (this.phase !== 'lobby' && !canDropIn) return { ok: false, code: 'started', msg: 'This race already started' };
      if (this.seats.size >= this.def.maxPlayers || t.seat >= this.def.maxPlayers) return { ok: false, code: 'full', msg: 'This room is full' };
      const liveNow = !!this.def.dropIn && this.phase === 'running';
      s = { seat: t.seat, uid: t.uid, name: t.name.slice(0, 40) || 'Player', peer: null, ready: !!this.def.dropIn, leftAt: 0, state: null, dirty: false, racing: liveNow, winStart: now, winCount: 0, floods: 0 };
      this.seats.set(t.seat, s);
      if (liveNow) this.referee.start([s.seat], now);
    }
    // A second connection for the same seat (new tab, reconnect) replaces the old one.
    if (s.peer && s.peer !== peer) { try { s.peer.send({ t: 'kicked', reason: 'joined elsewhere' }); s.peer.close(4001, 'replaced'); } catch { /* gone */ } }
    s.peer = peer; s.leftAt = 0;
    // Drop-in shards with zero countdown launch immediately on the first player so no one sits in a lobby.
    if (this.def.dropIn && this.phase === 'lobby' && this.def.countdownMs === 0 && this.connected >= Math.max(1, this.def.minPlayers)) {
      this.phase = 'running';
      this.startedAt = now;
      s.ready = true;
      s.racing = true;
      this.referee.start([s.seat], now);
    }
    peer.send({
      t: 'welcome', room: this.id, game: this.def.id, seat: s.seat, uid: s.uid, phase: this.phase, tickHz: this.hz, serverNow: now,
      goAt: this.goAt || undefined, players: this.roster(), min: this.opts.min,
      ...(this.meta ? { meta: this.meta } : {}),
      resume: this.opts.resume?.(t), states: this.snapshot(s.seat), result: this.result ?? undefined,
    });
    this.lobbyUpdate();
    return { ok: true };
  }

  /** The socket for `seat` closed. Only the current peer counts (a replaced socket closing is ignored). */
  leave(seat: number, peer: Peer, explicit = false): void {
    const s = this.seats.get(seat);
    if (!s || s.peer !== peer) return;
    s.peer = null; s.ready = false; s.leftAt = this.opts.now();
    // In the lobby or a drop-in shard, a seat that leaves on purpose is freed immediately.
    if ((this.phase === 'lobby' || this.def.dropIn) && explicit) this.seats.delete(seat);
    if (this.phase === 'running' && explicit) this.referee.dnf(seat, 'left');
    if (this.phase === 'countdown') { this.phase = 'lobby'; this.goAt = 0; }
    this.broadcast({ t: 'left', seat, explicit });
    this.lobbyUpdate();
  }

  message(seat: number, peer: Peer, msg: any): void {
    const s = this.seats.get(seat);
    if (!s || s.peer !== peer || !msg || typeof msg !== 'object') return;
    const now = this.opts.now();
    // Rate limit: about two messages per tick; a client that keeps flooding is dropped.
    if (now - s.winStart >= 1000) { if (s.winCount > this.hz * 6) s.floods++; s.winStart = now; s.winCount = 0; }
    if (++s.winCount > this.hz * 2 + 10) { if (s.floods >= 3) peer.close(4008, 'flood'); return; }
    switch (msg.t) {
      case 'ping': peer.send({ t: 'pong', c: Number(msg.c) || 0, s: now }); return;
      case 'ready':
        if (this.phase !== 'lobby' && this.phase !== 'countdown') return;
        s.ready = !!msg.ready;
        if (!s.ready && this.phase === 'countdown') { this.phase = 'lobby'; this.goAt = 0; }
        this.lobbyUpdate();
        return;
      case 'state': {
        if (this.phase === 'finished' || this.phase === 'closed') return;
        const st = cleanState(msg.s, this.def.maxStateBytes);
        if (!st) return;
        s.state = st; s.dirty = true;
        if (this.phase === 'running' && s.racing) this.referee.onState(seat, st, now);
        return;
      }
      case 'leave': this.leave(seat, peer, true); peer.close(1000, 'left'); return;
      default: return;
    }
  }

  private snapshot(forSeat: number, onlyDirty = false): Array<PlayerState & { seat: number }> {
    const me = this.seats.get(forSeat);
    const r = this.def.interestRadius;
    const out: Array<PlayerState & { seat: number }> = [];
    for (const s of this.seats.values()) {
      if (s.seat === forSeat || !s.state || (onlyDirty && !s.dirty)) continue;
      if (r > 0 && me?.state && typeof s.state.x === 'number' && typeof me.state.x === 'number'
        && Math.hypot(Number(s.state.x) - Number(me.state.x), Number(s.state.z ?? 0) - Number(me.state.z ?? 0)) > r) continue;
      out.push({ ...s.state, seat: s.seat });
    }
    return out;
  }

  /** Advance timers and relay states. The server calls this every tickMs; tests call it with a fake clock. */
  tick(): void {
    const now = this.opts.now();
    if (this.phase === 'closed') return;
    this.tickN++;

    if (this.connected === 0) { if (!this.emptySince) this.emptySince = now; } else this.emptySince = 0;

    if (this.phase === 'lobby') {
      const here = [...this.seats.values()].filter(s => s.peer);
      if (here.length >= Math.max(this.opts.min, this.def.minPlayers) && here.every(s => s.ready)) {
        this.phase = 'countdown';
        this.goAt = now + this.def.countdownMs;
        this.broadcast({ t: 'countdown', goAt: this.goAt, serverNow: now });
        this.lobbyUpdate();
      }
      // Drop seats that dropped out of the lobby past the grace window.
      for (const s of [...this.seats.values()]) if (!s.peer && s.leftAt && now - s.leftAt > this.def.reconnectGraceMs) this.seats.delete(s.seat);
      if (this.emptySince && now - this.emptySince > (this.opts.idleMs ?? 5 * 60_000)) this.close('idle');
    } else if (this.phase === 'countdown') {
      if (now >= this.goAt) {
        this.phase = 'running';
        this.startedAt = now;
        const racing = [...this.seats.values()].filter(s => s.peer && s.ready);
        for (const s of racing) s.racing = true;
        // Anyone in the room who wasn't on the grid is out of this race.
        for (const s of this.seats.values()) if (!s.racing) this.seats.delete(s.seat);
        this.referee.start(racing.map(s => s.seat), now);
        this.broadcast({ t: 'go', at: now, seats: racing.map(s => s.seat) });
      }
    } else if (this.phase === 'running') {
      for (const s of [...this.seats.values()]) {
        if (!s.peer && s.leftAt && now - s.leftAt > this.def.reconnectGraceMs) {
          this.referee.dnf(s.seat, 'left');
          if (this.def.dropIn) { this.seats.delete(s.seat); this.lobbyUpdate(); }
        }
      }
      for (const f of this.referee.drainFinishes()) this.broadcast({ t: 'finish', ...f });
      if (this.referee.done(now)) this.finish(now);
      else if (this.def.dropIn && this.emptySince && now - this.emptySince > (this.opts.idleMs ?? 5 * 60_000)) this.close('idle');
    } else if (this.phase === 'finished') {
      if (now - this.finishedAt > (this.opts.lingerMs ?? 15_000) || this.connected === 0) this.close('finished');
      return;
    }

    // Relay: changed states every tick, everything once a second (covers a lost frame or a late joiner).
    const full = this.tickN % this.hz === 0;
    let any = false;
    for (const s of this.seats.values()) {
      if (!s.peer) continue;
      const states = this.snapshot(s.seat, !full);
      if (states.length) { s.peer.send({ t: 'tick', n: this.tickN, at: now, s: states }); any = true; }
    }
    if (any || full) for (const s of this.seats.values()) s.dirty = false;
  }

  private finish(now: number): void {
    this.phase = 'finished';
    this.finishedAt = now;
    for (const f of this.referee.drainFinishes()) this.broadcast({ t: 'finish', ...f });
    const standings = this.referee.standings().map(st => {
      const s = this.seats.get(st.seat)!;
      return { ...st, uid: s.uid, name: s.name };
    });
    this.result = { matchId: this.id, game: this.def.id, rated: this.opts.rated, startedAt: this.startedAt, endedAt: now, standings };
    this.broadcast({ t: 'result', result: this.result });
    this.opts.onResult(this.result);
  }

  /** Tell everyone the API recorded (or failed to record) the result. */
  recorded(ok: boolean): void { this.broadcast({ t: 'recorded', ok }); }

  close(reason: string): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    for (const s of this.seats.values()) if (s.peer) { try { s.peer.send({ t: 'closed', reason }); s.peer.close(1000, reason); } catch { /* gone */ } s.peer = null; }
  }
}
