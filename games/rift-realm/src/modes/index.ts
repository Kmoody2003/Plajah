// Game modes: any map can host any mode. A mode is its rules (win / lose, score, timer, waves, respawns), its HUD line,
// and what it needs from a map (modes/arena.ts derives that from every level). The menu's Mode step (menu/modeSelect.ts)
// and ?mode=<id> pick one; the Void Sanctum's Trial runes start one in the hub.
//
//   explore   Free Roam: today's game. Endless trials waves, Domination on maps with control points. The default.
//   survival  Wave Survival: hold out against escalating waves; three downs and it's over.
//   trials    Trials (time attack): five rounds, the champion last; your time is the score.
//   boss      Boss Hunt: the champion waits at the far objective with an escort; find it and bring it down.
//   campaign  Story chapters (campaign/*): a map + a scripted objective list with intro / outro beats; reuses this
//             runner for its survive / trials / boss steps. Picked from the menu's Campaign screen or
//             ?campaign=<vessel>&chapter=<n>, never from the Mode step (hidden).
//   pvp, coop placeholders (not ready: they fall back to Free Roam).
import * as THREE from 'three/webgpu';
import type { ArenaDescriptor } from './arena';

export type ModeId = 'explore' | 'survival' | 'trials' | 'boss' | 'campaign' | 'pvp' | 'coop';

export interface ModeRules {
  win: string;
  lose: string;
  score: 'kills' | 'time' | 'points' | 'none';
  /** Seconds on the clock (survival: hold until it runs out). */
  timer?: number;
  waves: 'endless' | 'scripted' | 'none';
  respawn: 'spawn' | 'in-place';
  /** Downs allowed before the run is lost (undefined = unlimited). */
  lives?: number;
}
export interface ModeNeeds {
  spawns: 1 | 2;
  anchors: number;
  objectives: number;
  bounds: boolean;
}
export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  hex: string;
  /** false = a placeholder slot (shown as "coming soon", falls back to Free Roam). */
  ready: boolean;
  rules: ModeRules;
  needs: ModeNeeds;
  /** The game's own endless waves run (enemies.ts auto). */
  autoWaves: boolean;
  /** Domination (control points) runs on maps that have them. */
  domination: boolean;
  /** A structured run (ModeRunner drives it); none = the game's own loop. */
  scripted: boolean;
  /** Not listed on the menu's Mode step (the campaign has its own screens). */
  hidden?: boolean;
}

export const MODES: ModeDef[] = [
  { id: 'explore', name: 'Free Roam', blurb: 'Explore the map; the tournament\'s bots keep coming. Domination where the map has points.', hex: '#5eead4', ready: true,
    rules: { win: 'none (Domination: first to 100)', lose: 'none', score: 'points', waves: 'endless', respawn: 'in-place' },
    needs: { spawns: 1, anchors: 0, objectives: 0, bounds: false }, autoWaves: true, domination: true, scripted: false },
  { id: 'survival', name: 'Wave Survival', blurb: 'Three minutes of escalating waves. Three downs and you\'re out.', hex: '#c084fc', ready: true,
    rules: { win: 'survive the clock', lose: 'downed 3 times', score: 'kills', timer: 180, waves: 'scripted', respawn: 'spawn', lives: 3 },
    needs: { spawns: 1, anchors: 4, objectives: 0, bounds: true }, autoWaves: false, domination: false, scripted: true },
  { id: 'trials', name: 'Trials', blurb: 'Time attack: five rounds, then the champion. Beat your best time.', hex: '#fbbf24', ready: true,
    rules: { win: 'clear all five rounds', lose: 'none (downs cost time)', score: 'time', waves: 'scripted', respawn: 'in-place' },
    needs: { spawns: 1, anchors: 4, objectives: 0, bounds: true }, autoWaves: false, domination: false, scripted: true },
  { id: 'boss', name: 'Boss Hunt', blurb: 'The champion waits at the far end of the map with its escort. Hunt it down.', hex: '#fb7185', ready: true,
    rules: { win: 'defeat the champion', lose: 'downed 3 times', score: 'time', waves: 'none', respawn: 'spawn', lives: 3 },
    needs: { spawns: 1, anchors: 1, objectives: 1, bounds: true }, autoWaves: false, domination: false, scripted: true },
  { id: 'campaign', name: 'Campaign', blurb: 'One story per vessel: chapters of objectives with intro and outro beats.', hex: '#f0abfc', ready: true, hidden: true,
    rules: { win: 'clear the chapter objectives', lose: 'downed too often', score: 'time', waves: 'scripted', respawn: 'in-place', lives: 3 },
    needs: { spawns: 1, anchors: 4, objectives: 1, bounds: true }, autoWaves: false, domination: false, scripted: false },
  { id: 'pvp', name: 'PvP Arena', blurb: 'Vessel against vessel. Coming with the Gamer Network.', hex: '#38bdf8', ready: false,
    rules: { win: 'most points', lose: 'fewer points', score: 'points', waves: 'none', respawn: 'spawn' },
    needs: { spawns: 2, anchors: 6, objectives: 3, bounds: true }, autoWaves: false, domination: true, scripted: false },
  { id: 'coop', name: 'Co-op', blurb: 'Two vessels against the tournament. Coming soon.', hex: '#a3e635', ready: false,
    rules: { win: 'survive together', lose: 'all downed', score: 'kills', waves: 'scripted', respawn: 'spawn' },
    needs: { spawns: 1, anchors: 4, objectives: 0, bounds: true }, autoWaves: true, domination: false, scripted: false },
];
export const modeById = (id: string | null | undefined) => MODES.find((m) => m.id === id);

/** Mid-game character (Soul Vessel) switching is only permitted in unstructured Free Roam (`explore`), never during Campaign, Survival, Trials, Boss Hunt, or Studio-ruled runs. */
export function isVesselSwitchAllowed(opts: {
  modeId: ModeId | null | undefined;
  modeRunning?: boolean;
  inCampaign?: boolean;
  ruled?: boolean;
}): boolean {
  if (opts.inCampaign || opts.ruled || opts.modeRunning) return false;
  return !opts.modeId || opts.modeId === 'explore';
}
/** ?trials=<old name> from before the registry. */
const LEGACY: Record<string, ModeId> = { gauntlet: 'trials', survival: 'survival', duel: 'boss' };

/** The mode to run: the menu's pick, else ?mode=, else the old ?trials=; placeholders and unknowns fall back to Free Roam. */
export function resolveMode(pick?: string | null): { mode: ModeDef; asked: string | null; fellBack: boolean } {
  const q = new URLSearchParams(location.search);
  const asked = pick ?? q.get('mode') ?? (q.get('trials') ? LEGACY[q.get('trials')!] ?? q.get('trials') : null);
  const m = modeById(asked);
  if (m && m.ready) return { mode: m, asked, fellBack: false };
  return { mode: MODES[0], asked, fellBack: !!asked && asked !== 'explore' };
}

// ── the runner: drives a scripted mode on top of enemies.ts's EnemyManager (its auto waves off) ─────────────

type Archetype = 'rusher' | 'caster' | 'brute' | 'boss';
/** What a mode needs from enemies.ts's EnemyManager (all public there). */
export interface ModeFoes {
  enemies: { hp: number; boss?: boolean; mesh: THREE.Object3D }[];
  wave: number;
  onKilled?: (e: never) => void;
  spawnWave(count: number): void;
  spawnAt(pos: THREE.Vector3, archetype: Archetype): unknown;
  clear(): void;
}
/** Per-run overrides (the campaign's steps): a shorter survival clock, fewer trial rounds. */
export interface ModeRunOpts { timer?: number; rounds?: number }
export interface ModeResult { mode: ModeId; won: boolean; time: number; kills: number; downs: number; rounds: number }
export interface ModeHost {
  scene: THREE.Scene;
  foes: ModeFoes;
  arena: ArenaDescriptor;
  playerPos: () => THREE.Vector3;
  banner: (text: string, hex: string) => void;
  /** The run is over: show the result. `again` restarts the same mode. */
  finished: (r: ModeResult, again: () => void) => void;
}
/** A rune on the hub floor that starts a mode when you stand on it. */
export interface ModePad { pos: THREE.Vector3; radius: number; mode: ModeId; /** 0..1 dwell fill (drives the rune's glow) */ fill?: { value: number } }

const ROUNDS = 5, BREATHER = 4, DWELL = 1.4;
export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

export class ModeRunner {
  mode: ModeDef | null = null;
  private state: 'idle' | 'run' | 'break' | 'done' = 'idle';
  private round = 0;
  private t = 0;
  private breakT = 0;
  private topUp = 0;
  kills = 0;
  downs = 0;
  private dwell = new Map<ModePad, number>();
  private beacon: THREE.Mesh | null = null;
  private boss: { mesh: THREE.Object3D; hp: number } | null = null;
  private opts: ModeRunOpts = {};
  private get rounds() { return this.opts.rounds ?? ROUNDS; }
  private get timer() { return this.opts.timer ?? this.mode?.rules.timer ?? 180; }

  constructor(private host: ModeHost, private pads: ModePad[] = []) {
    const prev = host.foes.onKilled;
    host.foes.onKilled = ((e: never) => { prev?.(e); if (this.state === 'run') this.kills++; }) as never;
  }

  get running() { return this.state === 'run' || this.state === 'break'; }

  /** The HUD's mode line (null = the game's own line). */
  title(): string | null {
    const m = this.mode;
    if (!m) return null;
    if (this.state === 'done') return `${m.name} · done`;
    const lives = m.rules.lives ? ` · ${'♦'.repeat(Math.max(0, m.rules.lives - this.downs))}` : '';
    if (m.id === 'trials') return `${m.name} · round ${this.round}/${this.rounds} · ${fmtTime(this.t)}`;
    if (m.id === 'survival') return `${m.name} · ${fmtTime(Math.max(0, this.timer - this.t))} left · ${this.kills} kills${lives}`;
    if (m.id === 'boss') {
      const b = this.boss, p = this.host.playerPos();
      const d = b && b.hp > 0 ? ` · champion ${Math.round(Math.hypot(b.mesh.position.x - p.x, b.mesh.position.z - p.z))} m` : '';
      return `${m.name} · ${fmtTime(this.t)}${d}${lives}`;
    }
    return m.name;
  }

  start(id: ModeId, opts: ModeRunOpts = {}) {
    const m = modeById(id);
    if (!m || !m.scripted) return;
    this.opts = opts;
    const f = this.host.foes;
    f.clear(); this.clearBeacon();
    this.mode = m; this.state = 'run'; this.round = 0; this.t = 0; this.kills = 0; this.downs = 0; this.topUp = 0; this.boss = null;
    this.host.banner(m.name.toUpperCase(), m.hex);
    if (m.id === 'trials') this.nextRound();
    else if (m.id === 'survival') { f.wave = 1; f.spawnWave(3); }
    else if (m.id === 'boss') this.placeBoss();
  }

  playerDowned() {
    if (!this.running || !this.mode) return;
    this.downs++;
    if (this.mode.rules.lives && this.downs >= this.mode.rules.lives) { this.host.foes.clear(); this.finish(false); }
  }

  /** Spots sorted far → near from the player (a duel opens across the map). */
  private far(spots: THREE.Vector3[]) { const p = this.host.playerPos(); return [...spots].sort((a, b) => b.distanceToSquared(p) - a.distanceToSquared(p)); }

  private placeBoss() {
    const f = this.host.foes, A = this.host.arena;
    f.wave = 4;
    const at = this.far(A.objectives.length ? A.objectives : A.foeSpots)[0] ?? A.spawns.b;
    this.boss = (f.spawnAt(at, 'boss') as { mesh: THREE.Object3D; hp: number } | undefined) ?? null;
    // the escort: the two foe spots nearest the champion
    const near = [...A.foeSpots].sort((a, b) => a.distanceToSquared(at) - b.distanceToSquared(at));
    if (near[0]) f.spawnAt(near[0], 'brute');
    if (near[1]) f.spawnAt(near[1], 'caster');
    // a beacon over the champion's ground so it can be found on a big map
    const mat = new THREE.MeshBasicNodeMaterial({ color: 0xfb7185, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 60, 12, 1, true), mat);
    this.beacon.name = 'boss beacon vfx'; this.beacon.position.copy(at).setY(at.y + 30);
    this.host.scene.add(this.beacon);
  }
  private clearBeacon() { if (this.beacon) { this.host.scene.remove(this.beacon); this.beacon.geometry.dispose(); this.beacon = null; } }

  private nextRound() {
    const f = this.host.foes;
    this.round++;
    f.wave = this.round; // the archetype mix follows the wave (combat/tuning.ts): brutes from round 2; the HUD banners it
    if (this.round < this.rounds) f.spawnWave(2 + this.round);
    else { const s = this.far(this.host.arena.foeSpots); if (s[0]) f.spawnAt(s[0], 'boss'); if (s[1]) f.spawnAt(s[1], 'caster'); if (s[2]) f.spawnAt(s[2], 'rusher'); }
    this.state = 'run';
  }

  private finish(won: boolean) {
    this.state = 'done'; this.clearBeacon();
    const r: ModeResult = { mode: this.mode!.id, won, time: this.t, kills: this.kills, downs: this.downs, rounds: this.round };
    const opts = this.opts;
    this.host.finished(r, () => this.start(r.mode, opts));
  }

  update(dt: number) {
    // the hub's runes: stand on one (outside a run) to start that mode
    if (!this.running && this.pads.length) {
      const p = this.host.playerPos();
      for (const pad of this.pads) {
        const on = Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z) < pad.radius && Math.abs(p.y - pad.pos.y) < 1.5;
        const d = on ? (this.dwell.get(pad) ?? 0) + dt : 0;
        this.dwell.set(pad, d);
        if (pad.fill) pad.fill.value = Math.min(1, Math.max(0, d) / DWELL);
        if (d >= DWELL) { this.dwell.set(pad, -3); if (pad.fill) pad.fill.value = 0; this.start(pad.mode); break; }
      }
    } else for (const pad of this.pads) if (pad.fill) pad.fill.value = Math.max(0, pad.fill.value - dt * 2);
    if (this.beacon) (this.beacon.material as THREE.MeshBasicNodeMaterial).opacity = 0.16 + Math.sin(this.t * 3) * 0.06;
    if (!this.running || !this.mode) return;
    const f = this.host.foes, alive = f.enemies.filter((e) => e.hp > 0).length;
    this.t += dt;
    const id = this.mode.id;
    if (id === 'trials') {
      if (this.state === 'run' && alive === 0) {
        if (this.round >= this.rounds) return this.finish(true);
        this.state = 'break'; this.breakT = BREATHER;
        this.host.banner(`ROUND ${this.round} CLEAR · ${fmtTime(this.t)}`, this.mode.hex);
      } else if (this.state === 'break' && (this.breakT -= dt) <= 0) this.nextRound();
    } else if (id === 'survival') {
      const T = this.timer;
      if (this.t >= T) { f.clear(); return this.finish(true); }
      f.wave = 1 + Math.floor(this.t / 30);           // escalates every 30 s (brutes from the second)
      const want = 3 + Math.floor(this.t / 30);
      this.topUp -= dt;
      if (alive < want && this.topUp <= 0) { f.spawnWave(1); this.topUp = 1.2; }
    } else if (id === 'boss') {
      if (this.boss && this.boss.hp <= 0) { f.clear(); this.finish(true); }
    }
  }
}
