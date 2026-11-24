// The Trials: solo modes against the tournament's bots (docs/rift-realm-levels.md, "Duel / Trials: 1 + bots, waves").
// The game's own endless trials stay the default (enemies.ts spawns the next wave when the field is clear); these are the
// structured ones, run on top of the same EnemyManager with its auto waves off:
//   gauntlet: five rounds, a breather between them, the last one a boss with an escort; cleared = your time
//   survival: two minutes, the field keeps topping up and escalating; your kills
//   duel:     the Banished warden's champion (a boss) and you; your time
// Start one with ?trials=<mode> on any level, or step onto a Trial rune in the Void Sanctum hub (Level.trialPads).
import * as THREE from 'three/webgpu';

export type TrialMode = 'gauntlet' | 'survival' | 'duel';
export const TRIAL_MODES: Record<TrialMode, { name: string; blurb: string; hex: string }> = {
  gauntlet: { name: 'Gauntlet', blurb: 'Five rounds, then the champion', hex: '#fbbf24' },
  survival: { name: 'Survival', blurb: 'Two minutes, no let-up', hex: '#c084fc' },
  duel: { name: 'Duel', blurb: 'One champion, one vessel', hex: '#fb7185' },
};
export const isTrialMode = (s: string | null | undefined): s is TrialMode => !!s && s in TRIAL_MODES;

/** A rune on the hub floor that starts a trial when you stand on it. */
export interface TrialPad { pos: THREE.Vector3; radius: number; mode: TrialMode; /** 0..1 how far the dwell has filled (a level drives its glow from it) */ fill?: { value: number } }

type Archetype = 'rusher' | 'caster' | 'brute' | 'boss';
/** What the trials need from enemies.ts's EnemyManager (all public there). */
export interface TrialFoes {
  enemies: { hp: number }[];
  wave: number;
  onKilled?: (e: never) => void;
  spawnWave(count: number): void;
  spawnAt(pos: THREE.Vector3, archetype: Archetype): unknown;
  clear(): void;
}
export interface TrialHost {
  foes: TrialFoes;
  /** Where foes may stand (the level's enemy spots). */
  spots: THREE.Vector3[];
  playerPos: () => THREE.Vector3;
  banner: (text: string, hex: string) => void;
  /** The run is over: show the result. `again` restarts the same mode. */
  finished: (r: TrialResult, again: () => void) => void;
}
export interface TrialResult { mode: TrialMode; won: boolean; time: number; kills: number; downs: number; rounds: number }

const GAUNTLET_ROUNDS = 5, BREATHER = 4, SURVIVAL_SECONDS = 120, DWELL = 1.4;
export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

export class Trials {
  mode: TrialMode | null = null;
  private state: 'idle' | 'round' | 'break' | 'done' = 'idle';
  private round = 0;
  private t = 0;
  private breakT = 0;
  private topUp = 0;
  kills = 0;
  downs = 0;
  private dwell = new Map<TrialPad, number>();

  constructor(private host: TrialHost, private pads: TrialPad[] = []) {
    const prev = host.foes.onKilled;
    host.foes.onKilled = ((e: never) => { prev?.(e); if (this.state === 'round') this.kills++; }) as never;
  }

  get running() { return this.state === 'round' || this.state === 'break'; }

  /** The HUD's trial line. */
  title(): string | null {
    if (!this.mode) return null;
    const n = TRIAL_MODES[this.mode].name;
    if (this.state === 'done') return `${n} · done`;
    if (this.mode === 'gauntlet') return `${n} · round ${this.round}/${GAUNTLET_ROUNDS} · ${fmtTime(this.t)}`;
    if (this.mode === 'survival') return `${n} · ${fmtTime(Math.max(0, SURVIVAL_SECONDS - this.t))} left · ${this.kills} kills`;
    return `${n} · ${fmtTime(this.t)}`;
  }

  start(mode: TrialMode) {
    const f = this.host.foes;
    f.clear();
    this.mode = mode; this.state = 'round'; this.round = 0; this.t = 0; this.kills = 0; this.downs = 0; this.topUp = 0;
    this.host.banner(`TRIAL · ${TRIAL_MODES[mode].name.toUpperCase()}`, TRIAL_MODES[mode].hex);
    if (mode === 'gauntlet') this.nextRound();
    else if (mode === 'survival') { f.wave = 1; f.spawnWave(3); }
    else { f.wave = 4; this.spawnFar('boss'); }
  }

  playerDowned() { if (this.running) this.downs++; }

  /** Spawn at the spot farthest from the player (a duel opens across the arena). */
  private spawnFar(kind: Archetype, nth = 0) {
    const p = this.host.playerPos();
    const s = [...this.host.spots].sort((a, b) => b.distanceToSquared(p) - a.distanceToSquared(p))[nth % Math.max(1, this.host.spots.length)];
    if (s) this.host.foes.spawnAt(s, kind);
  }

  private nextRound() {
    const f = this.host.foes;
    this.round++;
    f.wave = this.round; // the archetype mix follows the wave (combat/tuning.ts): brutes from round 2; the HUD bannners it
    if (this.round < GAUNTLET_ROUNDS) f.spawnWave(2 + this.round);
    else { this.spawnFar('boss'); this.spawnFar('caster', 1); this.spawnFar('rusher', 2); }
    this.state = 'round';
  }

  private finish(won: boolean) {
    this.state = 'done';
    const r: TrialResult = { mode: this.mode!, won, time: this.t, kills: this.kills, downs: this.downs, rounds: this.round };
    this.host.finished(r, () => this.start(r.mode));
  }

  update(dt: number) {
    // the hub's Trial runes: stand on one (outside a run) to start it
    if (!this.running && this.pads.length) {
      const p = this.host.playerPos();
      for (const pad of this.pads) {
        const on = Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z) < pad.radius && Math.abs(p.y - pad.pos.y) < 1.5;
        const d = on ? (this.dwell.get(pad) ?? 0) + dt : 0;
        this.dwell.set(pad, d);
        if (pad.fill) pad.fill.value = Math.min(1, d / DWELL);
        if (d >= DWELL) { this.dwell.set(pad, -3); if (pad.fill) pad.fill.value = 0; this.start(pad.mode); break; }
      }
    } else for (const pad of this.pads) if (pad.fill) pad.fill.value = Math.max(0, pad.fill.value - dt * 2);
    if (!this.running) return;
    const f = this.host.foes, alive = f.enemies.filter((e) => e.hp > 0).length;
    this.t += dt;
    if (this.mode === 'gauntlet') {
      if (this.state === 'round' && alive === 0) {
        if (this.round >= GAUNTLET_ROUNDS) return this.finish(true);
        this.state = 'break'; this.breakT = BREATHER;
        this.host.banner(`ROUND ${this.round} CLEAR · ${fmtTime(this.t)}`, TRIAL_MODES.gauntlet.hex);
      } else if (this.state === 'break' && (this.breakT -= dt) <= 0) this.nextRound();
    } else if (this.mode === 'survival') {
      if (this.t >= SURVIVAL_SECONDS) { f.clear(); return this.finish(true); }
      f.wave = 1 + Math.floor(this.t / 30);           // escalates every 30 s (brutes from the second)
      const want = 3 + Math.floor(this.t / 30);
      this.topUp -= dt;
      if (alive < want && this.topUp <= 0) { f.spawnWave(1); this.topUp = 1.2; }
    } else if (this.mode === 'duel' && alive === 0) this.finish(true);
  }
}

/** The result card (DOM), in the game's match-end style. */
export function showTrialResult(r: TrialResult, again: () => void, close: () => void, backTo?: () => void) {
  const m = TRIAL_MODES[r.mode];
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(#0a0618dd,#03020af2);font-family:Segoe UI,sans-serif;color:#ece6ff';
  const line = r.mode === 'survival' ? `${r.kills} kills · downed ${r.downs}×` : `${fmtTime(r.time)} · ${r.kills} kills · downed ${r.downs}×`;
  const btn = (id: string, label: string, bg: string) => `<button id="${id}" style="margin:0 6px;padding:12px 24px;font:700 13px Segoe UI,sans-serif;letter-spacing:.14em;color:#0a0618;background:${bg};border:0;cursor:pointer">${label}</button>`;
  box.innerHTML = `<div style="text-align:center"><div style="letter-spacing:.4em;font-size:13px;color:#b4a6d9">THE VOID TOURNAMENT · TRIALS</div>
    <div style="font-size:60px;font-weight:800;letter-spacing:.08em;margin:10px 0;color:${m.hex};text-shadow:0 0 24px ${m.hex}">${m.name.toUpperCase()} ${r.won ? 'CLEARED' : 'OVER'}</div>
    <div style="font-size:18px;margin-bottom:22px">${line}</div>
    ${btn('rrTrialAgain', 'RUN IT AGAIN', `linear-gradient(90deg,${m.hex},#e9d5ff)`)}${btn('rrTrialClose', 'CONTINUE', '#cbd5e1')}${backTo ? btn('rrTrialHub', 'VOID SANCTUM', '#a78bfa') : ''}</div>`;
  document.body.appendChild(box);
  const done = (fn: () => void) => () => { box.remove(); fn(); };
  box.querySelector<HTMLButtonElement>('#rrTrialAgain')!.onclick = done(again);
  box.querySelector<HTMLButtonElement>('#rrTrialClose')!.onclick = done(close);
  if (backTo) box.querySelector<HTMLButtonElement>('#rrTrialHub')!.onclick = done(backTo);
}
