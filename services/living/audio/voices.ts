// Polyphony caps and voice stealing. Pure bookkeeping (no WebAudio): the engine registers each sound with how to release it, and the pool
// decides when an old one must be cut to make room. Cutting is always a short fade by the caller, never a hard stop (no clicks).

export interface PoolEntry {
  id: number;
  key: string;
  startedAt: number;
  endsAt: number;
  /** fade this voice out quickly and free its nodes */
  release(fadeSec: number): void;
}

export class VoicePool {
  private entries: PoolEntry[] = [];
  private nextId = 1;
  private lastStart = new Map<string, number>();
  stolen = 0;
  constructor(readonly max: number, readonly perKeyMax: number, readonly minGapSec = 0.03) {}

  /** Drop entries that have rung out. */
  prune(now: number) { this.entries = this.entries.filter((e) => e.endsAt > now); }
  active(now: number): number { this.prune(now); return this.entries.length; }
  activeKey(key: string, now: number): number { this.prune(now); return this.entries.filter((e) => e.key === key).length; }

  /** Same sound retriggered faster than minGap is a machine-gun; the engine skips it. */
  tooSoon(key: string, now: number): boolean {
    const last = this.lastStart.get(key);
    return last != null && now - last < this.minGapSec;
  }

  /**
   * Register a new voice. If the per-key or global cap is reached, the OLDEST matching voice is released (stolen).
   * Returns the new entry's id and the entries that were stolen.
   */
  acquire(key: string, now: number, endsAt: number, release: PoolEntry['release']): { id: number; stolen: PoolEntry[] } {
    this.prune(now);
    const stolen: PoolEntry[] = [];
    const steal = (pred: (e: PoolEntry) => boolean) => {
      const candidates = this.entries.filter(pred).sort((a, b) => a.startedAt - b.startedAt);
      const victim = candidates[0];
      if (!victim) return false;
      this.entries = this.entries.filter((e) => e !== victim); stolen.push(victim); this.stolen++;
      return true;
    };
    while (this.entries.filter((e) => e.key === key).length >= this.perKeyMax) if (!steal((e) => e.key === key)) break;
    while (this.entries.length >= this.max) if (!steal(() => true)) break;
    const entry: PoolEntry = { id: this.nextId++, key, startedAt: now, endsAt, release };
    this.entries.push(entry);
    this.lastStart.set(key, now);
    for (const s of stolen) s.release(0.04);
    return { id: entry.id, stolen };
  }

  release(id: number, fadeSec = 0.05) {
    const e = this.entries.find((x) => x.id === id); if (!e) return;
    this.entries = this.entries.filter((x) => x !== e); e.release(fadeSec);
  }

  releaseAll(fadeSec = 0.05) {
    const all = this.entries; this.entries = [];
    for (const e of all) e.release(fadeSec);
  }
}
