/**
 * Chora Fest progression (docs/apex-elohim/chora-fest-design.md): driving anywhere earns Fest Points; Fest Points earn Stage Passes; each pass opens an outpost of the
 * player's choosing; each opening is a show the player drives in to. Pure logic over a small save record, so it can be tested and saved with the garage.
 *
 *   FP sources   PR stunts (speed traps, speed zones, drift zones, danger signs): 100 FP per star, paid once per star level, +25 for a new personal best.
 *                Skill chains: drifting, air and near misses build a chain with a multiplier; it banks after 2.5 s without a skill (or is lost on a crash).
 *                Discoveries: the first visit to each festival site (+150) and every scenic road driven end to end (+300).
 *                Opening sets: being at an outpost for its opening show (+250).
 *   Stage Passes the totals in PASS_FP; any unspent pass opens any closed outpost. The Main Site is open from the start.
 */
export interface FestSave {
  fp: number;
  /** open site ids, in the order they opened (the main site first) */
  open: string[];
  /** opening shows the player has attended */
  seen: string[];
  /** best stars paid per challenge id */
  stars: Record<string, number>;
  /** best personal-best value per challenge id (to pay the PB bonus only on an improvement) */
  best: Record<string, number>;
  /** discoveries already paid */
  found: string[];
  /** biggest skill chain banked, FP */
  chainBest: number;
}

export const emptyFest = (main = 'main'): FestSave => ({ fp: 0, open: [main], seen: [], stars: {}, best: {}, found: [], chainBest: 0 });

/** total FP at which each Stage Pass is earned */
export const PASS_FP = [500, 1400, 2700, 4400, 6500, 9000, 12000, 15500];
export const FP = { star: 100, pb: 25, site: 150, road: 300, opening: 250 };

export interface FestSite { id: string; name: string; kind: 'main' | 'outpost'; x: number; z: number }

/** the virtual artists who play the opening sets, in turn */
export const OPENING_ACTS = ['VYRA', 'Orsolya Wren', 'Remi Lux'];

export function passesEarned(fp: number): number { let n = 0; while (n < PASS_FP.length && fp >= PASS_FP[n]) n++; return n; }

/** what an event is about, for the radio hosts: only these facts may be spoken */
export interface FestAbout { what: 'stars' | 'pb' | 'site' | 'road' | 'chain' | 'opening' | 'pass' | 'opened'; name?: string; n?: number; act?: string }
export interface FestEvent { kind: 'fp' | 'pass' | 'opened' | 'opening' | 'discovered'; fp: number; text: string; site?: string; about?: FestAbout }

export class Fest {
  readonly sites: FestSite[];
  constructor(private s: FestSave, sites: FestSite[], private persist: () => void = () => undefined) {
    this.sites = sites;
    const main = sites.find((x) => x.kind === 'main');
    if (main && !s.open.includes(main.id)) s.open.unshift(main.id);
  }
  get save(): FestSave { return this.s; }
  get fp(): number { return this.s.fp; }
  /** passes earned so far, and how many are still to spend */
  get passes(): { earned: number; free: number; next: number | null } {
    const earned = passesEarned(this.s.fp), used = this.s.open.filter((id) => this.sites.find((x) => x.id === id)?.kind === 'outpost').length;
    return { earned, free: Math.max(0, earned - used), next: earned < PASS_FP.length ? PASS_FP[earned] : null };
  }
  isOpen(id: string): boolean { return this.s.open.includes(id); }
  closed(): FestSite[] { return this.sites.filter((x) => !this.isOpen(x.id)); }

  /** add FP; returns the events (the FP itself, and a pass if one was crossed) */
  private add(fp: number, text: string, about?: FestAbout): FestEvent[] {
    if (fp <= 0) return [];
    const before = passesEarned(this.s.fp);
    this.s.fp += Math.round(fp);
    const out: FestEvent[] = [{ kind: 'fp', fp: Math.round(fp), text, about }];
    const after = passesEarned(this.s.fp);
    for (let k = before; k < after; k++) out.push({ kind: 'pass', fp: 0, text: `Stage Pass ${k + 1} earned: open an outpost on the map`, about: { what: 'pass', n: k + 1 } });
    this.persist();
    return out;
  }

  /** a PR stunt finished: pay new stars and a personal best */
  challenge(id: string, name: string, stars: number, value: number, higherIsBetter = true): FestEvent[] {
    const had = this.s.stars[id] ?? 0, out: FestEvent[] = [];
    if (stars > had) { this.s.stars[id] = stars; out.push(...this.add((stars - had) * FP.star, `${name} ${'★'.repeat(stars)}`, { what: 'stars', name, n: stars })); }
    const prev = this.s.best[id];
    if (value > 0 && (prev === undefined || (higherIsBetter ? value > prev : value < prev))) {
      this.s.best[id] = value;
      if (prev !== undefined) out.push(...this.add(FP.pb, `${name}: new personal best`, { what: 'pb', name, n: value }));
      else this.persist();
    }
    return out;
  }

  /** a first visit to a site, or a scenic road driven end to end */
  discover(id: string, text: string, fp: number, about?: FestAbout): FestEvent[] {
    if (this.s.found.includes(id)) return [];
    this.s.found.push(id);
    return [{ kind: 'discovered', fp: 0, text, about }, ...this.add(fp, text)];
  }

  /** a banked skill chain */
  skill(fp: number): FestEvent[] { if (fp > this.s.chainBest) this.s.chainBest = fp; return this.add(fp, 'Skill chain', { what: 'chain', n: fp }); }

  /** spend a pass on an outpost */
  openOutpost(id: string): FestEvent[] {
    const site = this.sites.find((x) => x.id === id);
    if (!site || this.isOpen(id) || this.passes.free <= 0) return [];
    this.s.open.push(id); this.persist();
    const act = OPENING_ACTS[(this.s.open.length - 2 + OPENING_ACTS.length) % OPENING_ACTS.length];
    return [{ kind: 'opened', fp: 0, site: id, text: `${site.name} is open. ${act} plays the opening set: drive to the stage`, about: { what: 'opened', name: site.name, act } }];
  }

  /** the act that opens (or opened) a site */
  actFor(id: string): string { const i = this.s.open.indexOf(id); return OPENING_ACTS[Math.max(0, i - 1) % OPENING_ACTS.length]; }

  /** where the car is: pays a first visit, and starts an opening show when the player reaches an open outpost whose opening they have not seen */
  arrive(x: number, z: number, r = 140): FestEvent[] {
    const out: FestEvent[] = [];
    for (const site of this.sites) {
      if (Math.hypot(site.x - x, site.z - z) > r) continue;
      out.push(...this.discover('site:' + site.id, `Found ${site.name}`, FP.site, { what: 'site', name: site.name }));
      if (site.kind === 'outpost' && this.isOpen(site.id) && !this.s.seen.includes(site.id)) {
        this.s.seen.push(site.id);
        out.push({ kind: 'opening', fp: 0, site: site.id, text: `Opening set at ${site.name}: ${this.actFor(site.id)} live on the stage`, about: { what: 'opening', name: site.name, act: this.actFor(site.id) } }, ...this.add(FP.opening, `${site.name} opening set`));
      }
    }
    return out;
  }
}

/**
 * Skill chains: drifting and air time score points every second, a near miss scores a lump; each new skill within the chain raises the multiplier (x1 .. x5).
 * The chain banks as FP (points / 10) once 2.5 s pass with no skill; a crash loses it.
 */
export class SkillChain {
  points = 0; mult = 1; idle = 0; private lastKind = '';
  private kinds = new Set<string>();
  /** returns the FP banked this step (0 most steps) */
  step(dt: number, o: { drifting: boolean; airborne: boolean; speed: number; nearMiss?: boolean; crashed?: boolean }): number {
    if (o.crashed) { this.reset(); return 0; }
    let scored = false;
    const hit = (kind: string, pts: number): void => {
      if (!this.kinds.has(kind) || kind !== this.lastKind) { if (this.points > 0 && kind !== this.lastKind) this.mult = Math.min(5, this.mult + 0.5); this.kinds.add(kind); }
      this.lastKind = kind; this.points += pts * this.mult; scored = true;
    };
    if (o.drifting && o.speed > 9) hit('drift', 60 * dt * Math.min(2, o.speed / 20));
    if (o.airborne && o.speed > 12) hit('air', 90 * dt);
    if (o.nearMiss && o.speed > 15) hit('near', 120);
    if (scored) { this.idle = 0; return 0; }
    if (this.points <= 0) return 0;
    this.idle += dt;
    if (this.idle < 2.5) return 0;
    const fp = Math.floor(this.points / 10);
    this.reset();
    return fp;
  }
  reset(): void { this.points = 0; this.mult = 1; this.idle = 0; this.lastKind = ''; this.kinds.clear(); }
}
