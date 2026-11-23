// The forest network: trees talk through their roots. One small event bus that the trees, the ents, the fungi and the
// creatures all share, so news of what the player does (and who they are becoming) spreads through the forest.
//
//   forest.notify(kind, pos, data?, src?)           something happened at pos
//   forest.subscribe(kind | '*', fn, { at? })       hear about it; with `at` (a point, or a function giving one) the
//                                                   news arrives after distance / ROOT_SPEED, as if carried by the roots
//   forest.recent(kind, near?, r?, sinceSec?)       what happened lately (near a point)
//   forest.soul() / forest.band()                   the player's soul: -1 dark … +1 light, and its band
//
// Kinds the danger layer sends: 'deed' { deed, light, soul } · 'soul' { soul, band } · 'player' { soul } (every 2 s) ·
// 'combat' { loud } · 'predator' { kind, state } · 'fungus' { act: 'burst' | 'roots' | 'charge' } · 'bond' { who }.
// Others (the ents' 'tree-hit', 'ent-wake', …) are welcome: the bus doesn't care what a kind means.
// Also on globalThis.__forest for code that would rather not import it.

export interface ForestPos { x: number; y?: number; z: number }
export interface ForestEvent { kind: string; pos: ForestPos; data: Record<string, unknown>; t: number; src?: string }
type Listener = { kind: string; fn: (ev: ForestEvent) => void; at?: ForestPos | (() => ForestPos | null) };

/** Metres a second news travels through the roots. */
export const ROOT_SPEED = 30;
const KEEP_SEC = 120, KEEP_MAX = 400;

export type SoulBand = 'dark' | 'neutral' | 'light';

class ForestNetwork {
  private listeners: Listener[] = [];
  private log: ForestEvent[] = [];
  private pending: { at: number; l: Listener; ev: ForestEvent }[] = [];
  private now = 0;
  private soulV = 0;

  /** Seconds since the network started (its own clock, advanced by tick). */
  get time() { return this.now; }

  notify(kind: string, pos: ForestPos, data: Record<string, unknown> = {}, src?: string) {
    const ev: ForestEvent = { kind, pos: { x: pos.x, y: pos.y, z: pos.z }, data, t: this.now, src };
    this.log.push(ev);
    if (this.log.length > KEEP_MAX) this.log.splice(0, this.log.length - KEEP_MAX);
    for (const l of this.listeners) {
      if (l.kind !== '*' && l.kind !== kind) continue;
      const at = typeof l.at === 'function' ? l.at() : l.at;
      if (!at) { this.call(l, ev); continue; }
      const d = Math.hypot(at.x - pos.x, at.z - pos.z);
      if (d < 1) this.call(l, ev); else this.pending.push({ at: this.now + d / ROOT_SPEED, l, ev });
    }
    return ev;
  }

  subscribe(kind: string, fn: (ev: ForestEvent) => void, opts: { at?: Listener['at'] } = {}) {
    const l: Listener = { kind, fn, at: opts.at };
    this.listeners.push(l);
    return () => { const i = this.listeners.indexOf(l); if (i >= 0) this.listeners.splice(i, 1); this.pending = this.pending.filter((p) => p.l !== l); };
  }

  recent(kind: string, near?: ForestPos, r = Infinity, sinceSec = 30): ForestEvent[] {
    const t0 = this.now - sinceSec;
    return this.log.filter((e) => e.t >= t0 && (kind === '*' || e.kind === kind) && (!near || Math.hypot(e.pos.x - near.x, e.pos.z - near.z) <= r));
  }

  /** The player's soul, -1 (dark) … +1 (light). Set by the soul meter (danger/soul.ts). */
  soul() { return this.soulV; }
  band(): SoulBand { return this.soulV <= -0.3 ? 'dark' : this.soulV >= 0.3 ? 'light' : 'neutral'; }
  setSoul(v: number) { this.soulV = Math.max(-1, Math.min(1, v)); }

  /** Advance the clock and deliver news that has reached its listeners (the danger layer calls it every frame). */
  tick(dt: number) {
    this.now += dt;
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.now);
      if (due.length) { this.pending = this.pending.filter((p) => p.at > this.now); for (const p of due) this.call(p.l, p.ev); }
    }
    if (this.log.length && this.log[0].t < this.now - KEEP_SEC) this.log = this.log.filter((e) => e.t >= this.now - KEEP_SEC);
  }

  private call(l: Listener, ev: ForestEvent) { try { l.fn(ev); } catch (e) { console.warn('[forest] listener failed', e); } }
}

export const forest = new ForestNetwork();
(globalThis as unknown as { __forest?: ForestNetwork }).__forest = forest;
export type { ForestNetwork };
