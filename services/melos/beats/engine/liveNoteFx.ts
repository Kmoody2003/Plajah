// Melos Beats — note FX for played notes. Keys and pads feed the same chain drawn notes go through:
// each held key is a note with no end yet, the chain is re-read every tick up to a short horizon,
// and whatever is newly due gets played. Nothing here touches audio, so it runs under `tsx --test`.
//
// The clock is the transport while it runs, and a free clock at the song tempo while it doesn't —
// an arp under your fingers works whether or not the song is playing.

import type { SongKey } from '../grooveDoc';
import { applyNoteFx, type FxNote, type ResolvedChain } from '../noteFx';

export interface LiveFxHost {
  now(): number;
  running(): boolean;
  /** Transport beat ↔ audio time (only asked while running). */
  beatAt(time: number): number;
  timeAt(beat: number): number;
  bpm(): number;
  songKey(): SongKey | null;
  /** Sound a note. `durSec` null = held until the returned stop is called. */
  play(channel: string, n: FxNote, when: number, durSec: number | null): (() => void) | void;
}

interface Channel {
  chain: ResolvedChain;
  seed: number;
  sources: FxNote[];
  /** Keys physically down (a latched arp keeps its notes after they're released). */
  down: Set<number>;
  fired: Map<string, number>;
  stops: Map<number, (() => void)[]>;
  nextSrc: number;
}

const HORIZON_SEC = 0.08;
const KEEP_BEATS = 32; // how long a released note's echoes may still ring

export class LiveNoteFx {
  private channels = new Map<string, Channel>();
  private free = { time: 0, bpm: 120 };
  private wasRunning = false;

  constructor(private host: LiveFxHost) {}

  active(): boolean { return this.channels.size > 0; }

  private beatNow(time: number): number {
    return this.host.running() ? this.host.beatAt(time) : (time - this.free.time) * this.free.bpm / 60;
  }
  private timeOf(beat: number): number {
    return this.host.running() ? this.host.timeAt(beat) : this.free.time + beat * 60 / this.free.bpm;
  }
  private secBetween(a: number, b: number): number {
    return this.timeOf(b) - this.timeOf(a);
  }

  /** Transport started or stopped: held notes carry on, from now, on the new clock. */
  private rebase(): void {
    const now = this.host.now();
    if (!this.host.running()) this.free = { time: now, bpm: this.host.bpm() };
    const beat = this.beatNow(now);
    for (const ch of this.channels.values()) {
      ch.sources = ch.sources.filter((s) => !Number.isFinite(s.len));
      for (const s of ch.sources) s.beat = beat;
      ch.fired.clear();
    }
  }

  private syncClock(): void {
    const running = this.host.running();
    if (running !== this.wasRunning) { this.wasRunning = running; this.rebase(); }
  }

  noteOn(id: string, chain: ResolvedChain, key: number, vel: number, seed: number, data?: unknown): void {
    this.syncClock();
    const now = this.host.now();
    if (!this.channels.size && !this.host.running()) this.free = { time: now, bpm: this.host.bpm() };
    let ch = this.channels.get(id);
    if (!ch) {
      ch = { chain, seed, sources: [], down: new Set(), fired: new Map(), stops: new Map(), nextSrc: 1 };
      this.channels.set(id, ch);
    }
    ch.chain = chain;
    // A latched arp holds its last chord until a NEW chord starts.
    if (chain.arp?.latch && !ch.down.size) this.closeAll(ch);
    ch.down.add(key);
    ch.sources.push({ key, vel, beat: this.beatNow(now), len: Infinity, src: ch.nextSrc++, data });
    this.tickChannel(id, ch);
  }

  noteOff(id: string, key: number): void {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.down.delete(key);
    if (ch.chain.arp?.latch) return;
    this.close(ch, (s) => s.key === key);
  }

  /** Every note of a channel up (a pad release). */
  channelOff(id: string): void {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.down.clear();
    this.closeAll(ch);
  }

  /** Hard stop: nothing held, nothing pending. */
  clear(): void {
    for (const ch of this.channels.values()) for (const list of ch.stops.values()) for (const stop of list) stop();
    this.channels.clear();
  }

  private closeAll(ch: Channel): void { this.close(ch, () => true); }

  private close(ch: Channel, match: (s: FxNote) => boolean): void {
    const beat = this.beatNow(this.host.now());
    for (const s of ch.sources) {
      if (Number.isFinite(s.len) || !match(s)) continue;
      s.len = Math.max(0.01, beat - s.beat);
      for (const stop of ch.stops.get(s.src) ?? []) stop();
      ch.stops.delete(s.src);
    }
  }

  tick(): void {
    this.syncClock();
    for (const [id, ch] of this.channels) this.tickChannel(id, ch);
  }

  private tickChannel(id: string, ch: Channel): void {
    const now = this.host.now();
    const to = this.beatNow(now + HORIZON_SEC);
    const generates = !!ch.chain.arp || ch.chain.rhythm.some((d) => d.kind === 'gate');
    // A long-held note under an arp: slide its start along so the re-read stays short. (Only then —
    // a chain that doesn't generate notes would read a moved note as a new one.)
    if (generates) for (const s of ch.sources) if (!Number.isFinite(s.len) && to - s.beat > 16) s.beat += 8;
    ch.sources = ch.sources.filter((s) => !Number.isFinite(s.len) || s.beat + s.len > to - KEEP_BEATS);
    if (!ch.sources.length && !ch.down.size) { this.channels.delete(id); return; }
    const out = applyNoteFx(ch.sources, ch.chain, { key: this.host.songKey(), seed: ch.seed, to });
    for (const n of out) {
      if (n.beat >= to) continue;
      const mark = `${n.src}:${Math.round(n.beat * 960)}:${n.key}`;
      if (ch.fired.has(mark)) continue;
      ch.fired.set(mark, n.beat);
      const when = Math.max(now, this.timeOf(n.beat));
      const open = !Number.isFinite(n.len);
      const stop = this.host.play(id, n, when, open ? null : this.secBetween(n.beat, n.beat + n.len));
      if (open && stop) {
        const list = ch.stops.get(n.src);
        if (list) list.push(stop); else ch.stops.set(n.src, [stop]);
      }
    }
    if (ch.fired.size > 512) for (const [m, b] of ch.fired) if (b < to - KEEP_BEATS) ch.fired.delete(m);
  }
}
