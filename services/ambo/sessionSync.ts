// sessionSync — several operator windows, one project.
//
// A real service has a lyrics operator, a scripture operator and a media
// operator. They must not each hold their own copy of the show. Exactly one
// window — the LEADER — owns the project state; the others (FOLLOWERS) see its
// rendered summary and send it control commands.
//
// The election is deliberately dull: the live tab with the lowest id wins.
// Ids start with a zero-padded creation timestamp, so "lowest" means "oldest",
// and the oldest window — the one that has the project open — stays leader
// until it closes or stops heart-beating.
//
// Pure election/merge logic is exported separately from the BroadcastChannel
// wrapper so it is testable without a DOM.
//
// SCOPE: followers receive a SessionSnapshot (what is live, the current show's
// slide list) — they do not hold a editable copy of the project. Full
// multi-operator editing is NOT implemented.

export const SESSION_CHANNEL = 'ambo-session-v1';
export const HEARTBEAT_MS = 1500;
export const STALE_MS = 4500;

export type OperatorRole = 'all' | 'lyrics' | 'scripture' | 'media';

export interface Peer {
  tabId: string; joinedAt: number; lastSeen: number; role: OperatorRole; label?: string;
  /** false = a thin operator window that holds no project and can never own it. */
  canLead?: boolean;
}

export interface SessionSlide { id: string; label: string; text?: string; group?: string; }
export interface SessionSnapshot {
  showId?: string;
  showTitle?: string;
  slides: SessionSlide[];
  liveSlideId: string | null;
  liveLabel?: string;
  scriptureRef?: string;
  blackout?: boolean;
}

export type SessionCommand =
  | { type: 'take-slide'; slideId: string }
  | { type: 'next' } | { type: 'prev' }
  | { type: 'fire-scripture'; reference: string; translation?: string }
  | { type: 'clear'; slot?: 'all' | 'slide' | 'scripture' | 'background' | 'prop' | 'overlay' }
  | { type: 'blackout'; on: boolean }
  | { type: 'run-routine'; routineId: string };

export type SessionMessage =
  | { t: 'hello'; peer: Peer }
  | { t: 'beat'; peer: Peer }
  | { t: 'bye'; tabId: string }
  | { t: 'state'; from: string; epoch: number; seq: number; snapshot: SessionSnapshot }
  | { t: 'cmd'; from: string; to?: string; cmdId: string; cmd: SessionCommand; role: OperatorRole }
  | { t: 'ack'; to: string; cmdId: string; ok: boolean; error?: string };

// ── Pure logic ───────────────────────────────────────────────────────────────

export function makeTabId(now = Date.now(), rnd = Math.random()): string {
  return `${String(now).padStart(15, '0')}-${Math.floor(rnd * 36 ** 4).toString(36).padStart(4, '0')}`;
}

export function livePeers(peers: Peer[], now: number, staleMs = STALE_MS): Peer[] {
  return peers.filter(p => now - p.lastSeen <= staleMs).sort((a, b) => (a.tabId < b.tabId ? -1 : a.tabId > b.tabId ? 1 : 0));
}

/** Lowest tab id among live peers. Self counts as live. */
export function electLeader(peers: Peer[], selfId: string, now: number, staleMs = STALE_MS, selfCanLead = true): string {
  const live = livePeers(peers.filter(p => p.tabId !== selfId), now, staleMs).filter(p => p.canLead !== false).map(p => p.tabId);
  const all = selfCanLead ? [...live, selfId] : live;
  return all.sort()[0] ?? '';
}

export function upsertPeer(peers: Peer[], p: Peer): Peer[] {
  const i = peers.findIndex(x => x.tabId === p.tabId);
  if (i < 0) return [...peers, p];
  const next = peers.slice(); next[i] = { ...peers[i], ...p }; return next;
}
export const removePeer = (peers: Peer[], tabId: string) => peers.filter(p => p.tabId !== tabId);

export interface Versioned { epoch: number; seq: number; }

/** Should an incoming leader snapshot replace the one we hold? Higher epoch wins, then higher seq. */
export function isNewer(incoming: Versioned, current: Versioned | null): boolean {
  if (!current) return true;
  if (incoming.epoch !== current.epoch) return incoming.epoch > current.epoch;
  return incoming.seq > current.seq;
}

export function mergeState<T extends Versioned>(current: T | null, incoming: T): T {
  return isNewer(incoming, current) ? incoming : (current as T);
}

/** Which commands a role may send. 'all' = everything. */
export function roleAllows(role: OperatorRole, cmd: SessionCommand): boolean {
  if (role === 'all') return true;
  switch (cmd.type) {
    case 'take-slide': case 'next': case 'prev': return role === 'lyrics';
    case 'fire-scripture': return role === 'scripture';
    case 'clear': return true;
    case 'blackout': return true;
    case 'run-routine': return role === 'media';
  }
}

// ── Channel wrapper ──────────────────────────────────────────────────────────

export interface ChannelLike {
  postMessage(m: any): void;
  addEventListener(t: 'message', fn: (e: { data: any }) => void): void;
  removeEventListener(t: 'message', fn: (e: { data: any }) => void): void;
  close(): void;
}

export interface SessionOptions {
  tabId?: string;
  role?: OperatorRole;
  label?: string;
  clock?: () => number;
  channel?: ChannelLike | null;
  /** Leader only: execute a command; resolve ok or throw. */
  onCommand?: (cmd: SessionCommand, from: string) => void | Promise<void>;
  /** Called whenever presence / leadership / snapshot changes. */
  onChange?: () => void;
  /** Set false in tests to drive heart-beats manually. */
  autoBeat?: boolean;
  /** Default true. Operator-only windows pass false. */
  canLead?: boolean;
}

export class SessionSync {
  readonly tabId: string;
  readonly role: OperatorRole;
  private label?: string;
  private joinedAt: number;
  peers: Peer[] = [];
  snapshot: (SessionSnapshot & Versioned) | null = null;
  epoch = 0;
  private seq = 0;
  private leaderId: string;
  private ch: ChannelLike | null;
  private clock: () => number;
  private opts: SessionOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<string, (r: { ok: boolean; error?: string }) => void>();
  private lastSnapshot: SessionSnapshot | null = null;

  constructor(opts: SessionOptions = {}) {
    this.opts = opts;
    this.clock = opts.clock ?? (() => Date.now());
    this.joinedAt = this.clock();
    this.tabId = opts.tabId ?? makeTabId(this.joinedAt);
    this.role = opts.role ?? 'all';
    this.label = opts.label;
    this.leaderId = opts.canLead === false ? '' : this.tabId;
    this.ch = opts.channel !== undefined ? opts.channel : (() => { try { return new BroadcastChannel(SESSION_CHANNEL) as unknown as ChannelLike; } catch { return null; } })();
    this.ch?.addEventListener('message', this.onMsg);
    this.send({ t: 'hello', peer: this.me() });
    if (opts.autoBeat !== false) this.timer = setInterval(() => this.beat(), HEARTBEAT_MS);
  }

  private me(): Peer { return { tabId: this.tabId, joinedAt: this.joinedAt, lastSeen: this.clock(), role: this.role, label: this.label, canLead: this.opts.canLead !== false }; }
  private send(m: SessionMessage) { try { this.ch?.postMessage(m); } catch { /* closed */ } }
  get leader(): string { return this.leaderId; }
  get isLeader(): boolean { return this.leaderId === this.tabId; }
  /** Everyone live, self included. */
  get presence(): Peer[] { return livePeers([...this.peers.filter(p => p.tabId !== this.tabId), this.me()], this.clock()); }

  /** Heart-beat + recompute leadership (also prunes dead peers). */
  beat() {
    const now = this.clock();
    this.send({ t: 'beat', peer: this.me() });
    this.peers = livePeers(this.peers, now);
    this.recompute();
  }

  private recompute() {
    const was = this.leaderId;
    this.leaderId = electLeader(this.peers, this.tabId, this.clock(), STALE_MS, this.opts.canLead !== false);
    if (this.leaderId !== was) {
      if (this.isLeader) {
        this.epoch = Math.max(this.epoch, this.snapshot?.epoch ?? 0) + 1;
        this.seq = 0;
        // Re-publish what we last knew so followers converge on the new leader at once.
        if (this.lastSnapshot) this.publish(this.lastSnapshot);
      }
      this.opts.onChange?.();
    }
  }

  private onMsg = (e: { data: SessionMessage }) => {
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        if (m.peer.tabId === this.tabId) return;
        this.peers = upsertPeer(this.peers, { ...m.peer, lastSeen: this.clock() });
        this.send({ t: 'beat', peer: this.me() }); // introduce ourselves back
        this.recompute();
        if (this.isLeader && this.lastSnapshot) this.publish(this.lastSnapshot);
        this.opts.onChange?.();
        break;
      case 'beat':
        if (m.peer.tabId === this.tabId) return;
        this.peers = upsertPeer(this.peers, { ...m.peer, lastSeen: this.clock() });
        this.recompute();
        this.opts.onChange?.();
        break;
      case 'bye':
        this.peers = removePeer(this.peers, m.tabId);
        this.recompute();
        this.opts.onChange?.();
        break;
      case 'state': {
        if (m.from === this.tabId) return;
        const incoming = { ...m.snapshot, epoch: m.epoch, seq: m.seq };
        const merged = mergeState(this.snapshot, incoming);
        if (merged !== this.snapshot) { this.snapshot = merged; this.opts.onChange?.(); }
        break;
      }
      case 'cmd':
        if (!this.isLeader || (m.to && m.to !== this.tabId)) return;
        void this.execute(m);
        break;
      case 'ack': {
        if (m.to !== this.tabId) return;
        const r = this.pending.get(m.cmdId);
        if (r) { this.pending.delete(m.cmdId); r(m.ok ? { ok: true } : { ok: false, error: m.error }); }
        break;
      }
    }
  };

  private async execute(m: Extract<SessionMessage, { t: 'cmd' }>) {
    let ok = true; let error: string | undefined;
    if (!roleAllows(m.role, m.cmd)) { ok = false; error = `Role "${m.role}" cannot ${m.cmd.type}`; }
    else {
      try { await this.opts.onCommand?.(m.cmd, m.from); } catch (e: any) { ok = false; error = e?.message || String(e); }
    }
    this.send({ t: 'ack', to: m.from, cmdId: m.cmdId, ok, error });
  }

  /** Leader: publish the rendered summary. No-op for followers. */
  publish(snapshot: SessionSnapshot) {
    this.lastSnapshot = snapshot;
    if (!this.isLeader) return;
    this.seq++;
    this.snapshot = { ...snapshot, epoch: this.epoch, seq: this.seq };
    this.send({ t: 'state', from: this.tabId, epoch: this.epoch, seq: this.seq, snapshot });
    this.opts.onChange?.();
  }

  /**
   * Follower: ask the leader to do something. Resolves with the leader's ack,
   * or { ok:false } after a timeout. If this window IS the leader it just runs it.
   */
  async command(cmd: SessionCommand, timeoutMs = 2000): Promise<{ ok: boolean; error?: string }> {
    if (!roleAllows(this.role, cmd)) return { ok: false, error: `Role "${this.role}" cannot ${cmd.type}` };
    if (this.isLeader) {
      try { await this.opts.onCommand?.(cmd, this.tabId); return { ok: true }; }
      catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
    }
    const cmdId = `${this.tabId}:${this.clock()}:${Math.random().toString(36).slice(2, 6)}`;
    return new Promise(res => {
      const t = setTimeout(() => { this.pending.delete(cmdId); res({ ok: false, error: 'Leader did not respond' }); }, timeoutMs);
      this.pending.set(cmdId, r => { clearTimeout(t); res(r); });
      this.send({ t: 'cmd', from: this.tabId, to: this.leaderId, cmdId, cmd, role: this.role });
    });
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.send({ t: 'bye', tabId: this.tabId });
    this.ch?.removeEventListener('message', this.onMsg);
    try { this.ch?.close(); } catch { /* */ }
  }
}

/** Open another operator window of the same app. */
export function operatorWindowUrl(role: OperatorRole = 'all', loc: { origin: string; pathname: string } = (typeof location !== 'undefined' ? location : { origin: '', pathname: '/' })): string {
  return `${loc.origin}${loc.pathname}?amboOp=1&role=${role}`;
}
