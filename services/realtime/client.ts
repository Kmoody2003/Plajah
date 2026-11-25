// Browser client for Plajah Realtime rooms. Game-agnostic: matchmaking and tickets through /api/gamer/rt,
// then one WebSocket to the room's realtime shard. Clock sync by ping/pong (the lowest-RTT sample wins),
// automatic reconnect inside the grace window using the room's resume ticket.
//
//   const rt = new RealtimeClient({ apiBase: '', getToken, game: 'apex-race', onEvent });
//   const matchId = await rt.quickMatch();            // or createPrivate() / joinCode(code)
//   await rt.connect(matchId);
//   rt.setReady(true); rt.sendState({ x, z, yaw, lap, splineT, ... });   // 20 Hz
//   rt.serverNow()  → align countdowns to the server's GO

export type RtPhase = 'idle' | 'queue' | 'connecting' | 'lobby' | 'countdown' | 'running' | 'finished' | 'closed';
export interface RtPlayer { seat: number; uid: string; name: string; ready: boolean; connected: boolean }
export interface RtStanding { seat: number; uid: string; name: string; place: number; timeMs: number | null; dnf: boolean; progress: number; why?: string }
export type RtState = Record<string, number | boolean | string> & { seat: number };

export type RtEvent =
  | { type: 'phase'; phase: RtPhase }
  | { type: 'lobby'; players: RtPlayer[]; min: number }
  | { type: 'countdown'; goAt: number }
  | { type: 'go'; at: number }
  | { type: 'states'; states: RtState[] }
  | { type: 'left'; seat: number }
  | { type: 'finish'; seat: number; place: number; timeMs: number }
  | { type: 'result'; standings: RtStanding[] }
  | { type: 'recorded'; ok: boolean }
  | { type: 'code'; code: string }
  | { type: 'error'; message: string };

export interface RealtimeClientOpts {
  apiBase: string;
  getToken(): Promise<string | null>;
  game: string;
  onEvent(e: RtEvent): void;
  WebSocketImpl?: typeof WebSocket;
}

export class RealtimeClient {
  phase: RtPhase = 'idle';
  seat = -1;
  uid = '';
  matchId = '';
  goAt = 0;
  players: RtPlayer[] = [];
  standings: RtStanding[] = [];
  private ws: WebSocket | null = null;
  private url = '';
  private resume = '';
  private offset = 0;
  private bestRtt = Infinity;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retries = 0;
  private closedByUs = false;
  private queueAbort = false;

  constructor(private o: RealtimeClientOpts) {}

  private setPhase(p: RtPhase): void { if (this.phase !== p) { this.phase = p; this.o.onEvent({ type: 'phase', phase: p }); } }

  private async api(method: string, path: string, body?: unknown): Promise<any> {
    const token = await this.o.getToken();
    if (!token) throw new Error('Sign in to race online');
    const res = await fetch(`${this.o.apiBase}/api/gamer/rt${path}`, {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    return j;
  }

  /** Is realtime switched on for this API? */
  static async enabled(apiBase: string): Promise<boolean> {
    try { const r = await fetch(`${apiBase}/api/gamer/rt/config`); return r.ok && (await r.json()).enabled === true; } catch { return false; }
  }

  /** Rated 1v1 queue; resolves with the match id once paired (polls every 1.5 s). */
  async quickMatch(): Promise<string> {
    this.queueAbort = false;
    this.setPhase('queue');
    let r = await this.api('POST', '/queue', { game: this.o.game });
    while (r.status !== 'matched') {
      if (this.queueAbort) throw new Error('Left the queue');
      await new Promise(res => setTimeout(res, 1500));
      r = await this.api('GET', `/queue?game=${encodeURIComponent(this.o.game)}`);
      if (r.status === 'idle') throw new Error('Left the queue');
    }
    return r.matchId;
  }
  async leaveQueue(): Promise<void> { this.queueAbort = true; await this.api('DELETE', `/queue?game=${encodeURIComponent(this.o.game)}`).catch(() => null); this.setPhase('idle'); }

  async createPrivate(): Promise<{ matchId: string; code: string }> {
    const r = await this.api('POST', '/private', { game: this.o.game });
    this.o.onEvent({ type: 'code', code: r.code });
    return r;
  }
  async joinCode(code: string): Promise<string> { return (await this.api('POST', '/join', { code })).matchId; }

  /** Get a ticket for the match and open the room socket. */
  async connect(matchId: string): Promise<void> {
    this.matchId = matchId;
    this.setPhase('connecting');
    const t = await this.api('POST', '/ticket', { matchId });
    if (!t.url) throw new Error('No realtime server configured');
    this.url = t.url;
    this.closedByUs = false;
    this.retries = 0;
    this.open(t.ticket);
  }

  private open(ticket: string): void {
    const WS = this.o.WebSocketImpl ?? WebSocket;
    const ws = new WS(this.url);
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', ticket })); this.ping(); };
    ws.onmessage = ev => { try { this.handle(JSON.parse(String(ev.data))); } catch { /* bad frame */ } };
    ws.onclose = ev => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      const fatal = ev.code === 4003 || ev.code === 4004 || ev.code === 4009 || ev.code === 4001;
      if (this.closedByUs || fatal || this.phase === 'finished' || this.phase === 'closed' || !this.resume || this.retries >= 8) {
        if (this.phase !== 'finished') this.setPhase('closed');
        return;
      }
      // Dropped: come back with the resume ticket before the room's grace window runs out.
      const wait = Math.min(4000, 300 * 2 ** this.retries++);
      setTimeout(() => { if (!this.closedByUs) this.open(this.resume); }, wait);
    };
    if (!this.pingTimer) this.pingTimer = setInterval(() => this.ping(), 2000);
  }

  private ping(): void { this.send({ t: 'ping', c: performance.now() }); }
  private send(m: unknown): void { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }

  private handle(m: any): void {
    switch (m.t) {
      case 'welcome':
        this.retries = 0;
        this.seat = m.seat; this.uid = m.uid; this.resume = m.resume || this.resume;
        this.players = m.players ?? [];
        if (typeof m.serverNow === 'number' && this.bestRtt === Infinity) this.offset = m.serverNow - Date.now();
        this.goAt = m.goAt ?? 0;
        this.setPhase(m.phase);
        this.o.onEvent({ type: 'lobby', players: this.players, min: m.min });
        if (m.goAt && m.phase === 'countdown') this.o.onEvent({ type: 'countdown', goAt: m.goAt });
        if (m.states?.length) this.o.onEvent({ type: 'states', states: m.states });
        if (m.result) { this.standings = m.result.standings; this.o.onEvent({ type: 'result', standings: this.standings }); }
        return;
      case 'pong': {
        const rtt = performance.now() - Number(m.c);
        // Keep the lowest-RTT sample: its half-RTT assumption is the least wrong.
        if (rtt >= 0 && rtt <= this.bestRtt * 1.2) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.s + rtt / 2 - Date.now(); }
        return;
      }
      case 'lobby':
        this.players = m.players ?? [];
        if (m.phase === 'lobby' && this.phase === 'countdown') { this.goAt = 0; this.setPhase('lobby'); }
        this.o.onEvent({ type: 'lobby', players: this.players, min: m.min });
        return;
      case 'countdown': this.goAt = m.goAt; this.setPhase('countdown'); this.o.onEvent({ type: 'countdown', goAt: m.goAt }); return;
      case 'go': this.setPhase('running'); this.o.onEvent({ type: 'go', at: m.at }); return;
      case 'tick': this.o.onEvent({ type: 'states', states: m.s ?? [] }); return;
      case 'left': this.o.onEvent({ type: 'left', seat: m.seat }); return;
      case 'finish': this.o.onEvent({ type: 'finish', seat: m.seat, place: m.place, timeMs: m.timeMs }); return;
      case 'result': this.standings = m.result?.standings ?? []; this.setPhase('finished'); this.o.onEvent({ type: 'result', standings: this.standings }); return;
      case 'recorded': this.o.onEvent({ type: 'recorded', ok: !!m.ok }); return;
      case 'error': this.o.onEvent({ type: 'error', message: String(m.msg || m.code) }); return;
      case 'closed': if (this.phase !== 'finished') this.setPhase('closed'); return;
      default: return;
    }
  }

  serverNow(): number { return Date.now() + this.offset; }
  setReady(ready: boolean): void { this.send({ t: 'ready', ready }); }
  sendState(s: Record<string, number | boolean | string>): void { this.send({ t: 'state', s }); }
  nameOf(seat: number): string { return this.players.find(p => p.seat === seat)?.name ?? `Seat ${seat + 1}`; }

  leave(): void {
    this.closedByUs = true;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) { this.send({ t: 'leave' }); try { this.ws.close(1000, 'left'); } catch { /* closed */ } this.ws = null; }
    this.setPhase('idle');
  }
}
