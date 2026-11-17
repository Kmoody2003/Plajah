// Delivery mode: an arcade courier shift. Passengers, food and packages pop up around the map; drive into a pickup, get the load to its drop before the clock runs out, and every
// on-time drop adds time to the shift and builds a chain multiplier. Carry several jobs at once and route them yourself. Late drops pay a fraction and break the chain.
// Pure logic: the game feeds it the car each frame and draws what it asks for (markers, compass, HUD).
import type { Medal } from './parts';
import type { DeliverySummary } from './progress';

export type JobKind = 'passenger' | 'food' | 'package';
export interface Spot { id: number; x: number; z: number; name: string }

export interface ShiftTier {
  id: 'rookie' | 'pro' | 'legend';
  name: string; blurb: string;
  shiftSec: number;              // the clock the shift starts with
  capacity: number;              // jobs carried at once
  parSpeedMps: number;           // the average speed the drop timers assume
  slackSec: number;              // grace added to every drop timer
  bonusSec: number;              // seconds added to the shift clock for an on-time drop
  minDist: number; maxDist: number;
  fareMult: number;
  medalEarnings: [number, number, number, number];   // bronze, silver, gold, elohim
  level: number;                 // player level needed
}
export const TIERS: Record<ShiftTier['id'], ShiftTier> = {
  rookie: { id: 'rookie', name: 'Rookie shift', blurb: 'Short hops and generous timers. Learn the streets.', shiftSec: 240, capacity: 2, parSpeedMps: 17, slackSec: 16, bonusSec: 18, minDist: 350, maxDist: 900, fareMult: 1, medalEarnings: [2500, 5000, 8500, 14000], level: 1 },
  pro: { id: 'pro', name: 'Pro shift', blurb: 'Longer runs, tighter timers, stack two orders.', shiftSec: 270, capacity: 3, parSpeedMps: 21, slackSec: 11, bonusSec: 16, minDist: 500, maxDist: 1500, fareMult: 1.5, medalEarnings: [6000, 12000, 20000, 32000], level: 5 },
  legend: { id: 'legend', name: 'Legend shift', blurb: 'Across the whole city, no slack. Chain them or lose the clock.', shiftSec: 300, capacity: 4, parSpeedMps: 25, slackSec: 7, bonusSec: 14, minDist: 700, maxDist: 2400, fareMult: 2.2, medalEarnings: [10000, 22000, 36000, 60000], level: 12 },
};
export const TIER_LIST: ShiftTier[] = [TIERS.rookie, TIERS.pro, TIERS.legend];

/** chain length -> multiplier */
export function chainMult(chain: number): number {
  return chain >= 12 ? 3 : chain >= 8 ? 2.5 : chain >= 5 ? 2 : chain >= 4 ? 1.75 : chain >= 3 ? 1.5 : chain >= 2 ? 1.25 : chain >= 1 ? 1.1 : 1;
}

export interface Job {
  id: number; kind: JobKind; from: Spot; to: Spot;
  distM: number;                 // crow-fly distance between the two spots
  allowedSec: number;            // the drop timer, started at pickup
  fare: number;
  fragile: boolean;              // packages: every knock costs
  state: 'offered' | 'carrying' | 'done' | 'late' | 'failed';
  left: number;                  // seconds on the drop timer (negative once late)
  hits: number;
  offeredAt: number;
}

export type ShiftEvent =
  | { type: 'pickup'; job: Job }
  | { type: 'deliver'; job: Job; pay: number; onTime: boolean; chain: number; mult: number; bonusSec: number; tip: number }
  | { type: 'late'; job: Job }
  | { type: 'failed'; job: Job }
  | { type: 'hit'; job: Job; speed: number }
  | { type: 'offer'; job: Job }
  | { type: 'end'; summary: DeliverySummary };

export interface CarFeed { x: number; z: number; speedMps: number; hit: boolean; wrongWay?: boolean; driftPts?: number }

export const PICKUP_R = 15;               // metres
export const STOP_SPEED = 14;             // m/s (about 50 km/h) or slower to load and drop
export const OVERTIME_FAIL = 45;          // seconds late before a job is dropped
export const LATE_PAY = 0.4;

export function mulberry32(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const KIND_MULT: Record<JobKind, number> = { passenger: 1, food: 0.85, package: 1.25 };
const DETOUR = 1.35;                       // roads are longer than the crow flies

export function fareFor(kind: JobKind, distM: number, tier: ShiftTier): number {
  return Math.round((100 + distM * 0.5) * KIND_MULT[kind] * tier.fareMult / 10) * 10;
}
export function allowedFor(kind: JobKind, distM: number, tier: ShiftTier): number {
  const base = distM * DETOUR / tier.parSpeedMps + tier.slackSec;
  return Math.round(base * (kind === 'food' ? 0.85 : kind === 'package' ? 1.1 : 1));
}

export class DeliveryShift {
  readonly tier: ShiftTier;
  clock: number;
  elapsed = 0;
  over = false;
  chain = 0; chainBest = 0;
  earnings = 0; score = 0;
  deliveries = 0; onTime = 0; late = 0; failed = 0;
  passengers = 0; food = 0; packages = 0;
  collisions = 0; topMps = 0; distM = 0;
  jobs: Job[] = [];
  private rng: () => number;
  private nextId = 1;
  private last: { x: number; z: number } | null = null;
  private hitCool = 0;
  private stopTimer = 0;

  constructor(tier: ShiftTier | ShiftTier['id'], private spots: Spot[], seed = Date.now()) {
    this.tier = typeof tier === 'string' ? TIERS[tier] : tier;
    this.clock = this.tier.shiftSec;
    this.rng = mulberry32(seed);
  }

  get carrying(): Job[] { return this.jobs.filter((j) => j.state === 'carrying' || j.state === 'late'); }
  get offers(): Job[] { return this.jobs.filter((j) => j.state === 'offered'); }
  get mult(): number { return chainMult(this.chain); }

  private pickSpot(near: { x: number; z: number }, min: number, max: number, not?: Spot): Spot | null {
    const c = this.spots.filter((s) => s !== not && (() => { const d = Math.hypot(s.x - near.x, s.z - near.z); return d >= min && d <= max; })());
    if (c.length) return c[Math.floor(this.rng() * c.length)];
    // nothing in range: take the spot closest to the range's middle so a thin map still works
    const mid = (min + max) / 2;
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) { if (s === not) continue; const d = Math.abs(Math.hypot(s.x - near.x, s.z - near.z) - mid); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  private makeOffer(car: { x: number; z: number }): Job | null {
    const from = this.pickSpot(car, 120, 750);
    if (!from) return null;
    const to = this.pickSpot(from, this.tier.minDist, this.tier.maxDist, from);
    if (!to) return null;
    const kinds: JobKind[] = ['passenger', 'food', 'package'];
    const kind = kinds[Math.floor(this.rng() * 3)];
    const distM = Math.hypot(to.x - from.x, to.z - from.z);
    const j: Job = { id: this.nextId++, kind, from, to, distM, allowedSec: allowedFor(kind, distM, this.tier), fare: fareFor(kind, distM, this.tier), fragile: kind === 'package' && this.rng() < 0.45, state: 'offered', left: 0, hits: 0, offeredAt: this.elapsed };
    j.left = j.allowedSec;
    return j;
  }

  /** advance the shift by dt seconds with the car's current state; returns what happened */
  update(dt: number, car: CarFeed): ShiftEvent[] {
    const ev: ShiftEvent[] = [];
    if (this.over) return ev;
    this.elapsed += dt;
    this.clock -= dt;
    this.hitCool = Math.max(0, this.hitCool - dt);
    if (this.last) this.distM += Math.hypot(car.x - this.last.x, car.z - this.last.z);
    this.last = { x: car.x, z: car.z };
    this.topMps = Math.max(this.topMps, car.speedMps);

    // keep a few offers on the map, near the car, and retire stale ones
    const want = this.tier.capacity + 2;
    this.jobs = this.jobs.filter((j) => {
      if (j.state === 'done' || j.state === 'failed') return false;                     // finished last frame; the event has been sent
      if (j.state === 'offered' && (this.elapsed - j.offeredAt > 90 || Math.hypot(j.from.x - car.x, j.from.z - car.z) > 1600)) return false;   // stale or left behind
      return true;
    });
    while (this.offers.length < want) { const o = this.makeOffer(car); if (!o) break; this.jobs.push(o); ev.push({ type: 'offer', job: o }); }

    // knocks: passengers and fragile packages mind, and every load gets a tally
    if (car.hit && this.hitCool <= 0) {
      this.hitCool = 0.9; this.collisions++;
      for (const j of this.carrying) { j.hits++; ev.push({ type: 'hit', job: j, speed: car.speedMps }); }
    }

    // drop timers
    for (const j of this.carrying) {
      j.left -= dt;
      if (j.left < 0 && j.state === 'carrying') { j.state = 'late'; this.chain = 0; ev.push({ type: 'late', job: j }); }
      if (j.state === 'late' && -j.left > OVERTIME_FAIL) { j.state = 'failed'; this.failed++; ev.push({ type: 'failed', job: j }); }
    }

    // loading and dropping: be inside the ring and slow enough, briefly
    const slow = car.speedMps <= STOP_SPEED;
    if (slow) {
      for (const j of this.carrying) {
        if (Math.hypot(j.to.x - car.x, j.to.z - car.z) <= PICKUP_R) ev.push(this.deliver(j));
      }
      if (this.carrying.length < this.tier.capacity) {
        for (const j of this.offers) {
          if (Math.hypot(j.from.x - car.x, j.from.z - car.z) <= PICKUP_R) {
            j.state = 'carrying'; j.left = j.allowedSec; ev.push({ type: 'pickup', job: j });
            if (this.carrying.length >= this.tier.capacity) break;
          }
        }
      }
    }
    if (this.clock <= 0) ev.push(this.end());
    return ev;
  }

  private deliver(j: Job): ShiftEvent {
    const wasLate = j.state === 'late';
    j.state = 'done';
    this.deliveries++;
    if (j.kind === 'passenger') this.passengers++; else if (j.kind === 'food') this.food++; else this.packages++;
    let pay = j.fare;
    let tip = 0, bonusSec = 0;
    // care: passengers hate knocks, fragile packages hate them more
    const knock = j.kind === 'passenger' ? 0.15 : j.fragile ? 0.25 : j.kind === 'food' ? 0.1 : 0.05;
    pay *= Math.max(0.35, 1 - knock * j.hits);
    if (wasLate) { pay *= LATE_PAY; this.late++; this.chain = 0; }
    else {
      this.onTime++; this.chain++; this.chainBest = Math.max(this.chainBest, this.chain);
      const frac = Math.max(0, j.left) / j.allowedSec;
      tip = Math.round(pay * frac * (j.kind === 'food' ? 0.6 : 0.35) / 10) * 10;     // food is about speed
      pay += tip;
      bonusSec = this.tier.bonusSec + Math.floor(Math.max(0, j.left) * 0.25);
      this.clock += bonusSec;
    }
    const mult = wasLate ? 1 : this.mult;
    pay = Math.round(pay * mult / 10) * 10;
    this.earnings += pay; this.score += pay + (wasLate ? 0 : this.chain * 50);
    return { type: 'deliver', job: j, pay, onTime: !wasLate, chain: this.chain, mult, bonusSec, tip };
  }

  private end(): ShiftEvent {
    this.over = true;
    for (const j of this.carrying) { j.state = 'failed'; this.failed++; }
    return { type: 'end', summary: this.summary() };
  }
  /** end the shift early (the player quits); what was earned is kept */
  quit(): ShiftEvent { return this.end(); }

  summary(): DeliverySummary {
    return {
      tier: this.tier.id, deliveries: this.deliveries, onTime: this.onTime, chainBest: this.chainBest, earnings: this.earnings,
      passengers: this.passengers, food: this.food, packages: this.packages, distanceKm: this.distM / 1000, topMph: this.topMps * 2.23694,
      collisions: this.collisions, durationSec: this.elapsed, shiftScore: this.score, medal: shiftMedal(this.tier, this.earnings),
    };
  }
}

export function shiftMedal(tier: ShiftTier, earnings: number): Medal | undefined {
  const m: Medal[] = ['bronze', 'silver', 'gold', 'elohim'];
  let out: Medal | undefined;
  tier.medalEarnings.forEach((need, i) => { if (earnings >= need) out = m[i]; });
  return out;
}

/** the pointer for the HUD: which way to the nearest thing the player should drive to (drop-offs first, most urgent first) */
export function nextTarget(shift: DeliveryShift, car: { x: number; z: number }): { spot: Spot; job: Job; kind: 'drop' | 'pickup'; dist: number } | null {
  const drops = [...shift.carrying].sort((a, b) => a.left - b.left);
  if (drops.length) { const j = drops[0]; return { spot: j.to, job: j, kind: 'drop', dist: Math.hypot(j.to.x - car.x, j.to.z - car.z) }; }
  let best: Job | null = null, bd = Infinity;
  for (const j of shift.offers) { const d = Math.hypot(j.from.x - car.x, j.from.z - car.z); if (d < bd) { bd = d; best = j; } }
  return best ? { spot: best.from, job: best, kind: 'pickup', dist: bd } : null;
}

const STREETS = ['Foundry', 'Harbor', 'Lakeshore', 'Ironport', 'Granite', 'Beacon', 'Marina', 'Cobalt', 'Copper', 'Atlas', 'Summit', 'Mercer', 'Regent', 'Halcyon', 'Pinewood', 'Kestrel', 'Meridian', 'Aurelia'];
const SUFFIX = ['St', 'Ave', 'Row', 'Way', 'Blvd', 'Pl', 'Ct', 'Rd'];
/** fictional addresses for generated drop points */
export function addressFor(i: number, rng: () => number): string {
  return `${10 + Math.floor(rng() * 980)} ${STREETS[Math.floor(rng() * STREETS.length)]} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`;
}
