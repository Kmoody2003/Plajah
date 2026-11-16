// The Garage: everything the player owns and has earned, with the rules for buying, fitting, tuning, selling, and being paid.
// Pure logic with an injectable storage so it can be tested; the UI and the game both talk to one Garage.
import { buildCar, carPi, fittedParts, newOwnedCar, type BuiltCar, type OwnedCar } from './build';
import { CAR_BY_ID, CAR_DEFS, classFor, stockSpec, type CarDef } from './catalog';
import { ACHIEVEMENTS, EVENT_IDS, EVENT_NAMES, OBJECTIVES, OBJECTIVE_BY_ID, medalAtLeast, statValue, type Objective, type Reward } from './objectives';
import { MEDALS, PARTS, PART_BY_ID, SLOTS, partsFor, slotAvailable, stockPart, type Medal, type PartDef, type SlotId, type Unlock } from './parts';
import { TUNE_PRESETS, clampTune, defaultTune, type Tune } from './tuning';
import { emptySave, emptyStats, levelOf, levelUpCredits, xpToReach, type GarageSave } from './types';

export const SAVE_KEY = 'apex.garage.v1';
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

export type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export interface RunResult {
  eventId: string;
  timeSec: number;               // the run's time (a lap, or the stage)
  parSec: number;                // the ideal-line time of the stock reference car on this event
  laps?: number;                 // laps completed in the run (1 for a stage)
  collisions: number;
  topMph: number;
  driftPoints: number;
  distanceKm: number;
  wetness: number;               // 0..1 average road wetness
  assists: { line: boolean; brake: boolean; steer: boolean };
  position?: number; fieldSize?: number;
}

export interface DeliverySummary {
  tier: 'rookie' | 'pro' | 'legend';
  deliveries: number;            // jobs finished (on time or not)
  onTime: number;
  chainBest: number;             // longest run of on-time deliveries
  earnings: number;              // credits the shift paid (fares, tips, bonuses)
  passengers: number; food: number; packages: number;
  distanceKm: number; topMph: number; collisions: number;
  durationSec: number;
  shiftScore: number;
  medal?: Medal;                 // medal the shift earned against the tier's targets
}

export interface Payout { label: string; credits: number }
export interface Outcome {
  credits: number; xp: number;
  lines: Payout[];
  medal?: Medal; newMedal: boolean; personalBest: boolean;
  levelUps: number[]; levelBonus: number;
  objectives: { id: string; title: string; reward: Reward }[];
  achievements: { id: string; title: string }[];
  newUnlocks: { kind: 'part' | 'car'; id: string; name: string }[];
}

/** the credits an event pays before bonuses */
export const EVENT_BASE: Record<string, number> = { ironport_grand_circuit: 1800, great_lakes_cliff_raceway: 3200, pinewood_rally_stage: 2600 };
export const MEDAL_MULT: Record<Medal | 'none', number> = { none: 0.4, bronze: 1, silver: 1.45, gold: 2, elohim: 3 };
/** a run is a medal by how close it gets to the ideal-line time: 1.0 is perfect */
export const MEDAL_LIMITS: Record<Medal, number> = { elohim: 1.05, gold: 1.15, silver: 1.3, bronze: 1.55 };
export function medalFor(timeSec: number, parSec: number): Medal | undefined {
  if (!(timeSec > 0) || !(parSec > 0)) return undefined;
  const r = timeSec / parSec;
  for (const m of ['elohim', 'gold', 'silver', 'bronze'] as Medal[]) if (r <= MEDAL_LIMITS[m]) return m;
  return undefined;
}
const medalRank = (m?: Medal): number => (m ? MEDALS.indexOf(m) + 1 : 0);

export class Garage {
  save: GarageSave;
  private listeners = new Set<() => void>();
  onAchievement?: (id: string, title: string) => void;

  constructor(private storage: StorageLike | null = null) {
    this.save = this.load();
    // every new player begins in the Kestrel Sovereign GT-R, the car the game was built around
    if (!this.save.cars.length && !this.save.starterClaimed) {
      const first = CAR_DEFS.find((d) => d.starter);
      if (first) { this.addCar(first.id); this.save.starterClaimed = true; this.log(`Your career starts in the ${first.make} ${first.name}.`); }
    }
    if (!this.save.seenUnlocks.length) this.markSeenQuiet();     // what is open from the start is not news
  }

  // ---------- persistence ----------
  private load(): GarageSave {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as GarageSave;
        if (s && s.v === 1 && Array.isArray(s.cars)) return { ...emptySave(), ...s, stats: { ...emptyStats(), ...s.stats } };
      }
    } catch { /* corrupt or blocked: start fresh */ }
    return emptySave();
  }
  persist(): void {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage blocked */ }
    this.listeners.forEach((f) => f());
  }
  subscribe(f: () => void): () => void { this.listeners.add(f); return () => this.listeners.delete(f); }
  exportJson(): string { return JSON.stringify(this.save); }
  importJson(json: string): Result {
    try {
      const s = JSON.parse(json) as GarageSave;
      if (!s || s.v !== 1 || !Array.isArray(s.cars)) return fail('That is not an Apex Elohim garage save.');
      this.save = { ...emptySave(), ...s, stats: { ...emptyStats(), ...s.stats } };
      this.persist();
      return { ok: true };
    } catch { return fail('That file could not be read.'); }
  }
  reset(): void { this.save = emptySave(); this.persist(); }

  private log(text: string): void { this.save.log.unshift({ t: Date.now(), text }); this.save.log.length = Math.min(this.save.log.length, 40); }

  // ---------- level and money ----------
  get credits(): number { return this.save.credits; }
  get xp(): number { return this.save.xp; }
  get level(): number { return levelOf(this.save.xp); }
  levelProgress(): { level: number; into: number; need: number; frac: number } {
    const l = this.level, a = xpToReach(l), b = xpToReach(l + 1);
    return { level: l, into: this.save.xp - a, need: b - a, frac: l >= 50 ? 1 : (this.save.xp - a) / (b - a) };
  }
  private earn(n: number): void { this.save.credits += n; this.save.stats.creditsEarned += n; }
  private spend(n: number): void { this.save.credits -= n; this.save.stats.creditsSpent += n; }
  /** adds XP and pays level-up credits; returns the levels reached */
  private gainXp(n: number): { levels: number[]; bonus: number } {
    const before = this.level;
    this.save.xp += Math.max(0, Math.round(n));
    const levels: number[] = []; let bonus = 0;
    for (let l = before + 1; l <= this.level; l++) { levels.push(l); bonus += levelUpCredits(l); }
    if (bonus) this.earn(bonus);
    return { levels, bonus };
  }

  // ---------- unlock rules ----------
  unlockMet(u: Unlock): boolean {
    const s = this.save;
    switch (u.kind) {
      case 'start': return true;
      case 'level': return this.level >= u.level;
      case 'wins': return statValue(s, 'golds') >= u.count;
      case 'medals': return Object.values(s.medals).filter((m) => medalRank(m) >= medalRank(u.min)).length >= u.count;
      case 'achievement': return s.achievements.includes(u.id);
      case 'objective': return s.completed.includes(u.id);
      case 'circuit': return medalAtLeast(s.medals[u.circuit], u.medal);
    }
  }
  partUnlocked(p: PartDef | string): boolean {
    const part = typeof p === 'string' ? PART_BY_ID[p] : p;
    return !!part && (part.tier === 0 || this.unlockMet(part.unlock) || (this.save.inventory[part.id] ?? 0) > 0);
  }
  carUnlocked(c: CarDef | string): boolean {
    const def = typeof c === 'string' ? CAR_BY_ID[c] : c;
    return !!def && this.unlockMet(def.unlock);
  }

  // ---------- cars ----------
  get cars(): OwnedCar[] { return this.save.cars; }
  get active(): OwnedCar | null { return this.save.cars.find((c) => c.uid === this.save.activeUid) ?? this.save.cars[0] ?? null; }
  car(uid: string): OwnedCar | undefined { return this.save.cars.find((c) => c.uid === uid); }
  def(uid: string): CarDef | undefined { const c = this.car(uid); return c ? CAR_BY_ID[c.carId] : undefined; }
  built(uid?: string): BuiltCar | null { const c = uid ? this.car(uid) : this.active; return c ? buildCar(c) : null; }
  owns(carId: string): boolean { return this.save.cars.some((c) => c.carId === carId); }
  needsStarter(): boolean { return !this.save.starterClaimed && this.save.cars.length === 0; }

  private addCar(carId: string): OwnedCar {
    const c = newOwnedCar(carId, 'car' + this.save.nextUid++);
    this.save.cars.push(c);
    if (!this.save.activeUid) this.save.activeUid = c.uid;
    return c;
  }
  claimStarter(carId: string): Result<{ car: OwnedCar }> {
    const d = CAR_BY_ID[carId];
    if (!this.needsStarter()) return fail('You already have your first car.');
    if (!d || !d.starter) return fail('That is not a starter car.');
    const car = this.addCar(carId);
    this.save.starterClaimed = true;
    this.log(`Picked up the ${d.make} ${d.name} to start the career.`);
    this.afterChange();
    return { ok: true, car };
  }
  buyCar(carId: string): Result<{ car: OwnedCar }> {
    const d = CAR_BY_ID[carId];
    if (!d) return fail('Unknown car.');
    if (this.owns(carId)) return fail('You already own that car.');
    if (!this.carUnlocked(d)) return fail('That car is still locked.');
    if (this.save.credits < d.price) return fail(`You need ${(d.price - this.save.credits).toLocaleString()} more credits.`);
    this.spend(d.price);
    const car = this.addCar(carId);
    this.log(`Bought the ${d.make} ${d.name} for ${d.price.toLocaleString()}.`);
    this.afterChange();
    return { ok: true, car };
  }
  /** a car can be won outright (objective reward); no money changes hands */
  private grantCar(carId: string): void {
    if (!CAR_BY_ID[carId] || this.owns(carId)) { this.earn(Math.round((CAR_BY_ID[carId]?.price ?? 0) * 0.5)); return; }
    this.addCar(carId);
  }
  sellValue(uid: string): number {
    const c = this.car(uid); if (!c) return 0;
    return Math.round(CAR_BY_ID[c.carId].price * 0.55);
  }
  sellCar(uid: string): Result<{ credits: number }> {
    const c = this.car(uid);
    if (!c) return fail('You do not own that car.');
    if (this.save.cars.length <= 1) return fail('You cannot sell your only car.');
    const credits = this.sellValue(uid);
    for (const id of Object.values(c.parts)) if (id && !id.endsWith('.0') && !id.endsWith('.0.ev')) this.save.inventory[id] = (this.save.inventory[id] ?? 0) + 1;   // the parts come back to the shelf
    this.save.cars = this.save.cars.filter((x) => x.uid !== uid);
    if (this.save.activeUid === uid) this.save.activeUid = this.save.cars[0].uid;
    this.earn(credits); this.save.stats.creditsEarned -= credits;      // a sale is not income
    this.log(`Sold the ${CAR_BY_ID[c.carId].name} for ${credits.toLocaleString()}; its parts went to the shelf.`);
    this.afterChange();
    return { ok: true, credits };
  }
  setActive(uid: string): Result { if (!this.car(uid)) return fail('You do not own that car.'); this.save.activeUid = uid; this.persist(); return { ok: true }; }
  rename(uid: string, name: string): void { const c = this.car(uid); if (c) { c.nickname = name.slice(0, 24) || undefined; this.persist(); } }
  setPaint(uid: string, css: string): void { const c = this.car(uid); if (c) { c.paint = css; this.persist(); } }

  // ---------- parts ----------
  /** price of a part for a particular car: bigger, faster cars cost more to upgrade */
  partPrice(part: PartDef, carId: string): number {
    const d = CAR_BY_ID[carId];
    const factor = Math.min(2.2, Math.max(0.6, 0.5 + (d.pi - 450) / 300));
    return Math.round(part.baseCost * factor / 10) * 10;
  }
  fitted(uid: string, slot: SlotId): PartDef {
    const c = this.car(uid)!, pt = CAR_BY_ID[c.carId].powertrain;
    const id = c.parts[slot];
    const p = id ? PART_BY_ID[id] : undefined;
    return p && (!p.only || p.only === pt) ? p : stockPart(slot, pt);
  }
  /** parts for a slot with whether each is fitted, owned on the shelf, unlocked and its price */
  slotOptions(uid: string, slot: SlotId): { part: PartDef; fitted: boolean; spare: number; unlocked: boolean; price: number }[] {
    const c = this.car(uid)!, pt = CAR_BY_ID[c.carId].powertrain, cur = this.fitted(uid, slot);
    return partsFor(slot, pt).map((part) => ({ part, fitted: part.id === cur.id, spare: this.save.inventory[part.id] ?? 0, unlocked: this.partUnlocked(part), price: this.partPrice(part, c.carId) }));
  }
  private setSlot(c: OwnedCar, slot: SlotId, part: PartDef): void {
    const old = this.fitted(c.uid, slot);
    if (old.tier > 0) this.save.inventory[old.id] = (this.save.inventory[old.id] ?? 0) + 1;
    if (part.tier === 0) delete c.parts[slot]; else c.parts[slot] = part.id;
  }
  /** fit a part: from the shelf if one is there, otherwise buy it for this car */
  install(uid: string, partId: string): Result<{ paid: number }> {
    const c = this.car(uid), part = PART_BY_ID[partId];
    if (!c || !part) return fail('Unknown car or part.');
    const pt = CAR_BY_ID[c.carId].powertrain;
    if (!slotAvailable(part.slot, pt) || (part.only && part.only !== pt)) return fail('That part does not fit this car.');
    if (this.fitted(uid, part.slot).id === part.id) return fail('That part is already fitted.');
    if (part.tier === 0) { this.setSlot(c, part.slot, part); this.afterChange(); return { ok: true, paid: 0 }; }
    const spare = this.save.inventory[part.id] ?? 0;
    let paid = 0;
    if (spare > 0) this.save.inventory[part.id] = spare - 1;
    else {
      if (!this.unlockMet(part.unlock)) return fail('That part is still locked.');
      paid = this.partPrice(part, c.carId);
      if (this.save.credits < paid) return fail(`You need ${(paid - this.save.credits).toLocaleString()} more credits.`);
      this.spend(paid);
    }
    this.setSlot(c, part.slot, part);
    if (this.save.inventory[part.id] === 0) delete this.save.inventory[part.id];
    this.log(`Fitted ${part.name} to the ${CAR_BY_ID[c.carId].name}${paid ? ` for ${paid.toLocaleString()}` : ''}.`);
    this.afterChange();
    return { ok: true, paid };
  }
  /** take a part off and put the stock part back; the old part goes to the shelf */
  uninstall(uid: string, slot: SlotId): Result {
    const c = this.car(uid); if (!c) return fail('You do not own that car.');
    const cur = this.fitted(uid, slot);
    if (cur.tier === 0) return fail('That is already the stock part.');
    this.setSlot(c, slot, stockPart(slot, CAR_BY_ID[c.carId].powertrain));
    this.afterChange();
    return { ok: true };
  }
  /** the whole build as a price: every part still to be bought to reach a target tier in all slots (a shopping list for the UI) */
  upgradeCost(uid: string, slot: SlotId, tier: number): number {
    const c = this.car(uid)!; const p = partsFor(slot, CAR_BY_ID[c.carId].powertrain).find((x) => x.tier === tier && !x.variant);
    return p ? this.partPrice(p, c.carId) : 0;
  }

  // ---------- tuning ----------
  setTune(uid: string, tune: Partial<Tune>): void { const c = this.car(uid); if (c) { c.tune = clampTune({ ...c.tune, ...tune }); this.persist(); } }
  applyPreset(uid: string, presetId: string): void {
    const c = this.car(uid), p = TUNE_PRESETS.find((x) => x.id === presetId); if (!c || !p) return;
    const stock = stockSpec(CAR_BY_ID[c.carId]);          // the pressure that suits the car is worked from its stock weight, as `applyTune` does
    c.tune = clampTune(p.make(c.tune, stock.massKg, stock.drivetrain));
    this.persist();
  }
  resetTune(uid: string): void { this.applyPreset(uid, 'balanced'); }

  // ---------- being paid ----------
  /** unlocked-but-unseen parts and cars, as a list for "new" badges */
  private unlockedIds(): Set<string> {
    const out = new Set<string>();
    for (const p of PARTS) if (p.tier > 0 && this.unlockMet(p.unlock)) out.add(p.id);
    for (const c of CAR_DEFS) if (this.unlockMet(c.unlock)) out.add('car:' + c.id);
    return out;
  }
  newUnlocks(): Outcome['newUnlocks'] {
    const seen = new Set(this.save.seenUnlocks), out: Outcome['newUnlocks'] = [];
    for (const id of this.unlockedIds()) {
      if (seen.has(id)) continue;
      if (id.startsWith('car:')) { const d = CAR_BY_ID[id.slice(4)]; if (d && !d.starter) out.push({ kind: 'car', id: d.id, name: `${d.make} ${d.name}` }); }
      else { const p = PART_BY_ID[id]; if (p) out.push({ kind: 'part', id: p.id, name: p.name }); }
    }
    return out;
  }
  markSeen(): void { this.save.seenUnlocks = [...this.unlockedIds()]; this.persist(); }

  private emptyOutcome(): Outcome { return { credits: 0, xp: 0, lines: [], newMedal: false, personalBest: false, levelUps: [], levelBonus: 0, objectives: [], achievements: [], newUnlocks: [] }; }

  private finish(o: Outcome): Outcome {
    // objectives and achievements can unlock each other and cascade, so loop until nothing new fires
    for (let guard = 0; guard < 8; guard++) {
      let fired = false;
      for (const obj of OBJECTIVES) {
        if (this.save.completed.includes(obj.id) || statValue(this.save, obj.stat) < obj.target) continue;
        this.save.completed.push(obj.id); fired = true;
        this.payReward(obj.reward, o, obj.title);
        o.objectives.push({ id: obj.id, title: obj.title, reward: obj.reward });
      }
      for (const a of ACHIEVEMENTS) {
        if (this.save.achievements.includes(a.id) || !a.test(this.save)) continue;
        this.save.achievements.push(a.id); fired = true;
        o.achievements.push({ id: a.id, title: a.title });
        this.onAchievement?.(a.id, a.title);
      }
      if (!fired) break;
    }
    o.newUnlocks = this.newUnlocks();
    this.markSeenQuiet();
    return o;
  }
  private markSeenQuiet(): void { this.save.seenUnlocks = [...this.unlockedIds()]; }
  private payReward(r: Reward, o: Outcome, label: string): void {
    if (r.credits) { this.earn(r.credits); o.credits += r.credits; o.lines.push({ label: `Objective: ${label}`, credits: r.credits }); }
    if (r.xp) { o.xp += r.xp; const g = this.gainXp(r.xp); o.levelUps.push(...g.levels); o.levelBonus += g.bonus; }
    if (r.part) { this.save.inventory[r.part] = (this.save.inventory[r.part] ?? 0) + 1; this.log(`Reward part: ${PART_BY_ID[r.part]?.name ?? r.part}`); }
    if (r.car) { this.grantCar(r.car); this.log(`Reward car: ${CAR_BY_ID[r.car]?.name ?? r.car}`); }
  }
  private afterChange(): void {
    // fitting parts and owning cars feed objectives too (Collector, Wrenching)
    const o = this.emptyOutcome(); this.finish(o);
    if (o.objectives.length || o.achievements.length || o.newUnlocks.length) this.pending.push(o);
    this.persist();
  }
  /** rewards that fired outside a run (buying a car, fitting parts); the UI shows these and clears them */
  pending: Outcome[] = [];
  takePending(): Outcome[] { const p = this.pending; this.pending = []; return p; }

  /** pay out a finished run and update the career */
  recordRun(r: RunResult): Outcome {
    const o = this.emptyOutcome(), s = this.save;
    const medal = medalFor(r.timeSec, r.parSec);
    const prevBest = s.bestTimes[r.eventId];
    o.medal = medal;
    const base = EVENT_BASE[r.eventId] ?? 1500;
    const laps = r.laps ?? 1;
    // payout lines
    o.lines.push({ label: `${EVENT_NAMES[r.eventId] ?? r.eventId}: ${medal ?? 'finish'}`, credits: Math.round(base * MEDAL_MULT[medal ?? 'none']) });
    if (r.collisions === 0) o.lines.push({ label: 'Clean run (no contact)', credits: Math.round(base * 0.2) });
    if (r.wetness > 0.35) o.lines.push({ label: r.wetness > 0.7 ? 'Storm driving' : 'Wet road driving', credits: Math.round(base * (r.wetness > 0.7 ? 0.25 : 0.15)) });
    const off = (r.assists.line ? 0 : 1) + (r.assists.brake ? 0 : 1) + (r.assists.steer ? 0 : 1);
    if (off) o.lines.push({ label: `Assists off x${off}`, credits: Math.round(base * 0.06 * off) });
    if (r.position && r.fieldSize && r.fieldSize > 1) o.lines.push({ label: `Position ${r.position} of ${r.fieldSize}`, credits: Math.round(base * 0.5 * (r.fieldSize - r.position) / (r.fieldSize - 1)) });
    if (medal && medalRank(medal) > medalRank(s.medals[r.eventId])) {
      o.newMedal = true;
      o.lines.push({ label: `First ${medal} medal here`, credits: Math.round(base * 0.5 * medalRank(medal)) });
      s.medals[r.eventId] = medal;
    }
    if (prevBest === undefined || r.timeSec < prevBest) { s.bestTimes[r.eventId] = r.timeSec; o.personalBest = prevBest !== undefined; }
    const credits = o.lines.reduce((n, l) => n + l.credits, 0);
    this.earn(credits); o.credits += credits;
    const xp = Math.round(credits * 0.12 + 40 * (medal ? medalRank(medal) : 0));
    o.xp += xp;
    const g = this.gainXp(xp); o.levelUps.push(...g.levels); o.levelBonus += g.bonus;
    // stats
    const st = s.stats;
    st.runs++; st.laps += laps; if (r.collisions === 0) st.cleanRuns++; if (r.wetness > 0.35) st.rainRuns++;
    st.distanceKm += r.distanceKm; st.driftPoints += Math.round(r.driftPoints); st.topMph = Math.max(st.topMph, r.topMph);
    const car = this.active; if (car) { car.odometerKm += r.distanceKm; if (medal && medalRank(medal) >= 3) car.wins++; }
    this.log(`${EVENT_NAMES[r.eventId] ?? r.eventId}: ${medal ?? 'finished'} · +${(credits + o.levelBonus).toLocaleString()} credits`);
    const out = this.finish(o);
    this.persist();
    return out;
  }

  /** pay out a delivery shift */
  recordDelivery(d: DeliverySummary): Outcome {
    const o = this.emptyOutcome(), s = this.save, st = s.stats;
    o.lines.push({ label: `${d.deliveries} deliveries (${d.onTime} on time)`, credits: d.earnings });
    this.earn(d.earnings); o.credits += d.earnings;
    const xp = Math.round(d.earnings * 0.1 + d.onTime * 12 + d.chainBest * 15);
    o.xp += xp;
    const g = this.gainXp(xp); o.levelUps.push(...g.levels); o.levelBonus += g.bonus;
    st.deliveries += d.deliveries; st.deliveryChainBest = Math.max(st.deliveryChainBest, d.chainBest); st.deliveryEarnings += d.earnings;
    st.passengers += d.passengers; st.food += d.food; st.packages += d.packages; st.deliveryShifts++;
    st.distanceKm += d.distanceKm; st.topMph = Math.max(st.topMph, d.topMph);
    const car = this.active; if (car) car.odometerKm += d.distanceKm;
    const id = 'delivery_' + d.tier;
    if (d.medal) {
      o.medal = d.medal;
      if (medalRank(d.medal) > medalRank(s.medals[id])) { s.medals[id] = d.medal; o.newMedal = true; }
    }
    if (s.bestTimes[id] === undefined || d.shiftScore > -s.bestTimes[id]) s.bestTimes[id] = -d.shiftScore;     // stored negative so lower is better like the lap times
    this.log(`Courier shift (${d.tier}): ${d.deliveries} drops, chain ${d.chainBest}, +${d.earnings.toLocaleString()} credits`);
    const out = this.finish(o);
    this.persist();
    return out;
  }

  // ---------- views for the UI ----------
  objectives(): { obj: Objective; value: number; done: boolean; frac: number }[] {
    return OBJECTIVES.map((obj) => { const v = statValue(this.save, obj.stat); return { obj, value: v, done: this.save.completed.includes(obj.id), frac: Math.min(1, v / obj.target) }; });
  }
  garageValue(): number { return this.save.cars.reduce((n, c) => n + this.sellValue(c.uid), 0); }
  classOf(uid: string): string { const c = this.car(uid); return c ? classFor(carPi(c)) : ''; }
  fittedList(uid: string): PartDef[] { const c = this.car(uid); return c ? fittedParts(c) : []; }
  slots = SLOTS;
  eventIds = EVENT_IDS;
  /** debugging and tests: grant money */
  grant(credits: number, xp = 0): void { this.earn(credits); this.gainXp(xp); this.persist(); }
}
