// Server-authoritative result hooks. A room feeds every accepted player state to its referee; only the
// referee decides finishes and the final standings. Clients never send "I won": the server derives the
// result from the stream of states it saw, with plausibility checks on every update.

export type PlayerState = Record<string, number | boolean | string>;

export interface Standing {
  seat: number;
  place: number;
  /** Server-measured time from GO to the finish line; null for a non-finisher. */
  timeMs: number | null;
  /** Did not finish (left past the grace window, flagged, or out of time). */
  dnf: boolean;
  /** Race progress in laps when the race ended (for ordering non-finishers). */
  progress: number;
  why?: 'left' | 'flagged' | 'time' | 'forfeit-win';
}

export interface FinishEvent { seat: number; place: number; timeMs: number }

export interface Referee {
  start(seats: number[], now: number): void;
  /** A state the room accepted from `seat`. The referee may clamp what it believes, but never trusts claims. */
  onState(seat: number, s: PlayerState, now: number): void;
  /** Seat is out (left past the grace window). */
  dnf(seat: number, why: 'left' | 'flagged'): void;
  /** Finishes since the last call, so the room can broadcast them. */
  drainFinishes(): FinishEvent[];
  done(now: number): boolean;
  standings(): Standing[];
}

export interface RaceConfig {
  laps: number;
  /** Fastest believable progress, laps per second. A faster claim is clamped and counted as a violation. */
  maxProgressPerSec: number;
  /** Fastest believable car speed from successive positions (m/s). */
  maxSpeedMps: number;
  /** After the first finisher, the rest have this long to finish. */
  finishGraceMs: number;
  maxRaceMs: number;
  /** Violations before a player is flagged out. */
  maxViolations?: number;
}

interface Racer { seat: number; p: number; at: number; x?: number; z?: number; violations: number; finishMs: number | null; place: number; out: null | 'left' | 'flagged' }

/** Circuit race. Progress = laps completed + position within the lap (0..1), from the client's state,
 * checked against a progress-rate cap and a position-speed cap, so a client can't teleport to the line. */
export class RaceReferee implements Referee {
  private racers = new Map<number, Racer>();
  private startAt = 0;
  private places = 0;
  private firstFinishAt = 0;
  private pending: FinishEvent[] = [];
  private readonly maxViolations: number;

  constructor(readonly cfg: RaceConfig) { this.maxViolations = cfg.maxViolations ?? 40; }

  start(seats: number[], now: number): void {
    this.startAt = now;
    for (const seat of seats) this.racers.set(seat, { seat, p: 0, at: now, violations: 0, finishMs: null, place: 0, out: null });
  }

  onState(seat: number, s: PlayerState, now: number): void {
    const r = this.racers.get(seat);
    if (!r || r.out || r.finishMs !== null) return;
    const lap = Math.max(0, Math.floor(Number(s.lap) || 0));
    const t = Math.min(0.9999, Math.max(0, Number(s.splineT) || 0));
    let p = Math.min(this.cfg.laps, lap + t);
    const dt = Math.max(50, now - r.at); // never divide by a burst of back-to-back packets
    const allowed = (this.cfg.maxProgressPerSec * dt) / 1000 + 0.01;
    if (p > r.p + allowed) { r.violations++; p = r.p + allowed; }
    if (p < r.p) p = r.p; // progress never goes backwards on the server's books (reversing doesn't un-lap you either)
    const x = Number(s.x), z = Number(s.z);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      if (r.x !== undefined && r.z !== undefined) {
        const d = Math.hypot(x - r.x, z - r.z);
        if (d > (this.cfg.maxSpeedMps * dt) / 1000 + 15) r.violations++; // +15 m slack for a reset-to-grid or a lag spike
      }
      r.x = x; r.z = z;
    }
    r.p = p; r.at = now;
    if (r.violations > this.maxViolations) { this.dnf(seat, 'flagged'); return; }
    if (p >= this.cfg.laps) {
      r.finishMs = now - this.startAt;
      r.place = ++this.places;
      if (!this.firstFinishAt) this.firstFinishAt = now;
      this.pending.push({ seat, place: r.place, timeMs: r.finishMs });
    }
  }

  dnf(seat: number, why: 'left' | 'flagged'): void {
    const r = this.racers.get(seat);
    if (r && !r.out && r.finishMs === null) r.out = why;
  }

  drainFinishes(): FinishEvent[] { const out = this.pending; this.pending = []; return out; }

  private active(): Racer[] { return [...this.racers.values()].filter(r => !r.out && r.finishMs === null); }

  done(now: number): boolean {
    if (!this.startAt) return false;
    const active = this.active();
    if (active.length === 0) return true;
    if (this.firstFinishAt && now - this.firstFinishAt > this.cfg.finishGraceMs) return true;
    if (now - this.startAt > this.cfg.maxRaceMs) return true;
    // Everyone else is out and nobody has finished: the last car running wins by forfeit.
    if (!this.places && active.length === 1 && this.racers.size >= 2) return true;
    return false;
  }

  standings(): Standing[] {
    const all = [...this.racers.values()];
    const finished = all.filter(r => r.finishMs !== null).sort((a, b) => a.place - b.place);
    const rest = all.filter(r => r.finishMs === null);
    const forfeit = !finished.length && rest.filter(r => !r.out).length === 1 && all.length >= 2;
    // Still running (not out) ahead of anyone out; then by progress.
    rest.sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.p - a.p || a.seat - b.seat);
    const out: Standing[] = finished.map(r => ({ seat: r.seat, place: r.place, timeMs: r.finishMs, dnf: false, progress: this.cfg.laps }));
    let place = finished.length;
    for (const r of rest) {
      place++;
      if (forfeit && !r.out) out.push({ seat: r.seat, place, timeMs: null, dnf: false, progress: round3(r.p), why: 'forfeit-win' });
      else out.push({ seat: r.seat, place, timeMs: null, dnf: true, progress: round3(r.p), why: r.out ?? 'time' });
    }
    return out;
  }
}

/** Persistent open-world cruising shard (Forza Horizon-style): never ends on a lap timer and never flags free-roam exploration. */
export class OpenWorldReferee implements Referee {
  private seats = new Set<number>();
  start(seats: number[]): void { for (const s of seats) this.seats.add(s); }
  onState(seat: number): void { this.seats.add(seat); }
  dnf(seat: number): void { this.seats.delete(seat); }
  drainFinishes(): FinishEvent[] { return []; }
  done(): boolean { return false; }
  standings(): Standing[] { return []; }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
