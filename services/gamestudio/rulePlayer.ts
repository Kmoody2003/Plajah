// The rule player (plan Phase 2): runs a level's rules while the game plays. It knows nothing about
// rendering or physics. The game tells it what happened (events, plus a tick with the player's position
// and a few numbers) and it calls the game's host to act (show text, spawn, win, …). Every rule that fires
// is reported as its sentence, so the Studio can show a play log that reads like the rules panel.
//
// The game owns: enemies, items, HUD. The player owns: which rules match, timers, zone entry, how long a
// point is held, wave bookkeeping, conditions, and the level's end (won/lost), after which nothing fires.

import type { ParamValue, Rule, RuleAction, RuleCond, Vec3, Zone } from './schema';
import { ACTIONS, EVENTS, ruleSentence, type NameLookup } from './rules';

export interface RuleHost {
  showText(text: string): void;
  /** Bring in `count` enemies tagged `who`, as wave number `wave`. */
  spawnWave(count: number, who: string, wave: number): void;
  spawnBoss(who: string, wave: number): void;
  giveItem(item: string): void;
  /** Timer shown on the HUD; null hides it. */
  setTimer(secondsLeft: number | null): void;
  win(next?: string): void;
  lose(): void;
  restartFromCheckpoint(): void;
  unlockLevel?(level: string): void;
  /** A rule fired: its id and how it reads. */
  fired?(rule: Rule, sentence: string): void;
}

/** What the game measures each frame. */
export interface TickState {
  player: Vec3;
  /** Seconds the player's side has held a control point, continuously. */
  pointHeldSeconds?: number;
  hp?: number;
  score?: number;
}

export type LevelOutcome = 'playing' | 'won' | 'lost';

const inBox = (p: Vec3, z: Zone) => {
  if (!z.box) return false;
  const { center: c, size: s } = z.box;
  return Math.abs(p[0] - c[0]) <= s[0] / 2 && Math.abs(p[1] - c[1]) <= s[1] / 2 + 1 && Math.abs(p[2] - c[2]) <= s[2] / 2;
};

function compare(a: ParamValue | undefined, op: RuleCond['op'], b: ParamValue): boolean {
  if (a === undefined) return false;
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return (a as number) < (b as number);
    case '<=': return (a as number) <= (b as number);
    case '>': return (a as number) > (b as number);
    case '>=': return (a as number) >= (b as number);
  }
}

export class RulePlayer {
  outcome: LevelOutcome = 'playing';
  /** Rule-spawned enemies alive, by wave. */
  private alive = new Map<number, number>();
  private wave = 0;
  private spawnedAny = false;
  private timer: number | null = null;
  private inside = new Set<string>();
  private heldFired = new Set<string>();
  private items = new Map<string, number>();
  private elapsed = 0;
  private last: TickState | null = null;
  private started = false;
  readonly log: { t: number; ruleId: string; sentence: string }[] = [];

  constructor(private rules: Rule[], private zones: Zone[], private host: RuleHost, private names?: NameLookup) {
    this.rules = rules.filter(r => r.enabled);
  }

  /** True when the level has rules to run (else the game keeps its own default loop). */
  get active() { return this.rules.length > 0; }

  /** Zones some rule waits on (the game can show them as goal beacons). */
  goalZones(): Zone[] {
    const ids = new Set(this.rules.filter(r => r.when.event === 'enterZone').map(r => r.when.zone));
    return this.zones.filter(z => ids.has(z.id) && z.box);
  }

  /** How many of an item some rule wants collected (the game places that many pickups if it has no spots). */
  wantedItems(): { item: string; count: number }[] {
    return this.rules.filter(r => r.when.event === 'itemsCollected').map(r => ({ item: String(r.when.item ?? ''), count: Number(r.when.count ?? 1) }));
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.emit('levelStart');
  }

  vars(): Record<string, ParamValue | undefined> {
    let enemies = 0; for (const n of this.alive.values()) enemies += n;
    let items = 0; for (const n of this.items.values()) items += n;
    return { time: Math.round(this.elapsed), timer: this.timer ?? undefined, enemies, items, wave: this.wave, hp: this.last?.hp, score: this.last?.score };
  }

  /** Fire every enabled rule waiting on this event whose parameters and conditions match. */
  emit(event: string, args: Record<string, ParamValue | undefined> = {}) {
    if (this.outcome !== 'playing') return;
    const v = this.vars();
    for (const r of this.rules) {
      if (this.outcome !== 'playing') return;
      if (r.when.event !== event) continue;
      if (!matches(r, args)) continue;
      if (!r.if.every(c => compare(v[c.var], c.op, c.value))) continue;
      const sentence = ruleSentence(r, this.names);
      this.log.push({ t: Math.round(this.elapsed * 10) / 10, ruleId: r.id, sentence });
      this.host.fired?.(r, sentence);
      for (const a of r.do) this.act(a);
    }
  }

  private act(a: RuleAction) {
    const h = this.host;
    switch (a.action) {
      case 'showText': h.showText(String(a.text ?? '')); break;
      case 'startTimer': this.timer = Math.max(0, Number(a.seconds ?? 60)); h.setTimer(this.timer); break;
      case 'spawnWave': {
        const n = Math.max(1, Math.round(Number(a.count ?? 3)));
        const wave = ++this.wave;
        this.alive.set(wave, (this.alive.get(wave) ?? 0) + n);
        this.spawnedAny = true;
        h.spawnWave(n, String(a.who ?? ''), wave);
        break;
      }
      case 'spawnBoss': {
        const wave = ++this.wave;
        this.alive.set(wave, 1);
        this.spawnedAny = true;
        h.spawnBoss(String(a.who ?? ''), wave);
        break;
      }
      case 'giveItem': h.giveItem(String(a.item ?? '')); break;
      case 'unlockLevel': h.unlockLevel?.(String(a.level ?? '')); break;
      case 'winLevel': this.end('won'); h.setTimer(null); h.win(typeof a.next === 'string' ? a.next : undefined); break;
      case 'loseLevel': this.end('lost'); h.setTimer(null); h.lose(); break;
      case 'restartFromCheckpoint': h.restartFromCheckpoint(); break;
      default: break; // an action this player doesn't know yet does nothing (it still reads as a sentence)
    }
  }

  private end(o: LevelOutcome) { this.outcome = o; }

  /** The game says an enemy died: `who` is its tag, `wave` the wave it came in (0 = not rule-spawned). */
  enemyDown(who: string, wave: number) {
    if (this.outcome !== 'playing') return;
    this.emit('enemyDown', { who });
    if (!wave || !this.alive.has(wave)) return;
    const left = Math.max(0, this.alive.get(wave)! - 1);
    this.alive.set(wave, left);
    if (left === 0) this.emit('waveCleared', { wave });
    let total = 0; for (const n of this.alive.values()) total += n;
    if (total === 0 && this.spawnedAny) this.emit('allEnemiesDown');
  }

  collected(item: string) {
    if (this.outcome !== 'playing') return;
    const n = (this.items.get(item) ?? 0) + 1;
    this.items.set(item, n);
    this.emit('itemsCollected', { item, count: n });
  }

  playerDowned() { this.emit('playerDowned'); }

  tick(dt: number, s: TickState) {
    if (!this.started || this.outcome !== 'playing') return;
    this.last = s;
    this.elapsed += dt;
    if (this.timer !== null) {
      this.timer = Math.max(0, this.timer - dt);
      this.host.setTimer(this.timer);
      if (this.timer === 0) { this.timer = null; this.host.setTimer(null); this.emit('timerEnds'); }
    }
    for (const z of this.zones) {
      if (!z.box) continue;
      const now = inBox(s.player, z);
      if (now && !this.inside.has(z.id)) { this.inside.add(z.id); this.emit('enterZone', { zone: z.id }); }
      else if (!now) this.inside.delete(z.id);
    }
    if (s.pointHeldSeconds !== undefined) {
      for (const r of this.rules) {
        if (r.when.event !== 'pointHeld' || this.heldFired.has(r.id)) continue;
        if (s.pointHeldSeconds >= Number(r.when.seconds ?? 30)) { this.heldFired.add(r.id); this.emit('pointHeld', { seconds: r.when.seconds }); }
      }
      if (s.pointHeldSeconds === 0) this.heldFired.clear();
    }
  }
}

/** Does an event's payload satisfy what the rule waits for? Parameters the rule leaves empty match anything. */
function matches(r: Rule, args: Record<string, ParamValue | undefined>): boolean {
  const w = r.when;
  switch (w.event) {
    case 'enemyDown': return !w.who || w.who === args.who;
    case 'enterZone': return !w.zone || w.zone === args.zone;
    case 'waveCleared': return w.wave === undefined || w.wave === args.wave;
    case 'pointHeld': return w.seconds === undefined || w.seconds === args.seconds;
    case 'itemsCollected': return (!w.item || w.item === args.item) && Number(args.count ?? 0) === Number(w.count ?? 1);
    default: return true;
  }
}

/**
 * The names a game shows for the ids its rules mention (cast, items, levels, zones), keyed `kind:id`.
 * The Studio sends this with a level so the game can say "Dracula" without knowing the story.
 */
export function ruleNames(rules: Rule[], names: NameLookup): Record<string, string> {
  const out: Record<string, string> = {};
  const take = (spec: { params?: Record<string, string> } | undefined, args: Record<string, ParamValue | undefined>) => {
    for (const [k, kind] of Object.entries(spec?.params ?? {})) {
      const id = args[k];
      if (typeof id !== 'string' || !['cast', 'item', 'level', 'zone'].includes(kind)) continue;
      const n = names(kind, id);
      if (n) out[`${kind}:${id}`] = n;
    }
  };
  for (const r of rules) {
    take(EVENTS[r.when.event], r.when);
    for (const a of r.do) { take(ACTIONS[a.action], a); if (a.action === 'winLevel') take({ params: { next: 'level' } }, a); }
  }
  return out;
}
