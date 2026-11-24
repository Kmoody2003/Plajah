// The chapter runner: intro beat → the chapter's steps in order → outro beat → chapter clear (saved), or fallen → retry.
// Steps are built on what already exists: reach / clear / explore use the map's arena descriptor (modes/arena.ts) and
// the EnemyManager; survive / trials / boss run the game's own modes (modes/index.ts ModeRunner, nested here with a
// shorter clock / fewer rounds) and report back through its `finished` hook.
import * as THREE from 'three/webgpu';
import { ModeRunner, fmtTime, type ModeFoes } from '../modes';
import type { ArenaDescriptor } from '../modes/arena';
import type { Campaign, Chapter, Spot, Step } from './data';
import { playCards, showChapterResult } from './cards';
import { progress } from './progress';

export interface CampaignHost {
  scene: THREE.Scene;
  foes: ModeFoes;
  arena: ArenaDescriptor;
  playerPos: () => THREE.Vector3;
  banner: (text: string, hex: string) => void;
  /** freeze / unfreeze the player for a beat (pointer lock released while frozen) */
  freeze: (on: boolean) => void;
  mood: (m: 'explore' | 'combat' | 'boss' | 'victory' | 'defeat') => void;
  /** back to the chapter's start: full health, at the spawn */
  respawn: () => void;
  /** leave this chapter: another chapter (reload into it) or null = the campaign menu */
  goto: (chapter: number | null) => void;
}

type State = 'idle' | 'beat' | 'step' | 'outro' | 'done' | 'failed';

export class CampaignRunner {
  state: State = 'idle';
  stepI = -1;
  t = 0;
  kills = 0;
  downs = 0;
  private stepT = 0;
  private beacon: THREE.Mesh | null = null;
  private target: THREE.Vector3 | null = null;
  private nested: ModeRunner;
  private nestedOn = false;
  private counting = false;
  private introDone = false;

  constructor(private host: CampaignHost, readonly campaign: Campaign, readonly chapter: Chapter) {
    const prev = host.foes.onKilled;
    host.foes.onKilled = ((e: never) => { prev?.(e); if (this.counting) this.kills++; }) as never;
    // the game's modes, nested: their finish advances the chapter instead of showing the mode's own result card
    this.nested = new ModeRunner({
      scene: host.scene, foes: host.foes, arena: host.arena, playerPos: host.playerPos, banner: () => { /* the step banners instead */ },
      finished: (r) => { this.nestedOn = false; if (r.won) this.next(); else this.fail(); },
    });
  }

  get step(): Step | null { return this.chapter.steps[this.stepI] ?? null; }
  get livesLeft() { return Math.max(0, this.chapter.lives - this.downs); }
  private get kicker() { return `${this.campaign.name.toUpperCase()} · CHAPTER ${this.chapter.n}`; }

  /** HUD line. */
  title(): string {
    const s = this.step, lives = ` · ${'♦'.repeat(this.livesLeft)}`;
    if (this.state === 'done') return `${this.campaign.name} · Chapter ${this.chapter.n} · clear`;
    if (this.state === 'failed') return `${this.campaign.name} · Chapter ${this.chapter.n} · fallen`;
    if (!s || s.kind === 'card' || this.state !== 'step') return `${this.campaign.name} · ${this.chapter.title}`;
    const n = this.chapter.steps.filter((x) => x.kind !== 'card'), k = n.indexOf(s) + 1;
    let detail = '';
    if (s.kind === 'reach' || (s.kind === 'explore' && this.target)) detail = this.target ? ` · ${Math.round(this.dist(this.target))} m` : '';
    if (s.kind === 'explore') detail += ` · ${fmtTime(Math.max(0, s.seconds - this.stepT))}`;
    if (s.kind === 'clear') detail = ` · ${this.alive()} left`;
    if (this.nestedOn) { const nt = this.nested.title(); if (nt) detail = ` · ${nt.replace(/^[^·]+·\s*/, '').replace(/\s*·\s*♦*$/, '')}`; } // the mode's own name and lives off
    return `${s.label}${detail} · ${k}/${n.length}${lives}`;
  }

  /** Start the chapter (intro beat first, once; a retry goes straight to the steps). */
  async start() {
    progress.started(this.campaign.id, this.chapter.n);
    this.host.foes.clear();
    this.t = 0; this.kills = 0; this.downs = 0; this.stepI = -1;
    if (!this.introDone) {
      this.state = 'beat';
      this.host.freeze(true);
      this.host.mood('explore');
      await playCards(this.chapter.intro, { hex: this.campaign.hex, kicker: this.kicker, heading: { n: `${this.campaign.name} · Chapter ${this.chapter.n}`, title: this.chapter.title } });
      this.introDone = true;
      this.host.freeze(false);
    }
    this.counting = true;
    this.next();
  }

  playerDowned() {
    if (this.state !== 'step') return;
    this.downs++;
    if (this.downs >= this.chapter.lives) this.fail();
  }

  // ── steps ──
  private async next() {
    this.clearBeacon();
    this.stepI++;
    this.stepT = 0;
    const s = this.step;
    if (!s) { void this.outro(); return; }
    if (s.kind === 'card') {
      this.state = 'beat';
      this.host.freeze(true);
      await playCards(s.cards, { hex: this.campaign.hex, kicker: this.kicker });
      if (this.state !== 'beat') return; // failed / left meanwhile
      this.host.freeze(false);
      this.next();
      return;
    }
    this.state = 'step';
    this.host.banner(s.label.toUpperCase(), this.campaign.hex);
    const f = this.host.foes;
    if (s.kind === 'reach') this.mark(this.spot(s.at), 0x5eead4);
    else if (s.kind === 'explore') { this.host.mood('explore'); if (s.at) this.mark(this.spot(s.at), 0x5eead4); }
    else if (s.kind === 'clear') {
      this.host.mood('combat');
      f.wave = Math.max(1, this.chapter.n);
      const spots = this.farSpots();
      for (let i = 0; i < s.count; i++) f.spawnAt(spots[i % Math.max(1, spots.length)] ?? this.host.arena.spawns.b, s.mix?.[i % s.mix.length] ?? (i % 3 === 2 ? 'caster' : 'rusher'));
    } else if (s.kind === 'survive') { this.host.mood('combat'); this.nestedOn = true; this.nested.start('survival', { timer: s.seconds }); }
    else if (s.kind === 'trials') { this.host.mood('combat'); this.nestedOn = true; this.nested.start('trials', { rounds: s.rounds }); }
    else if (s.kind === 'boss') { this.host.mood('boss'); this.nestedOn = true; this.nested.start('boss'); }
  }

  update(dt: number) {
    if (this.beacon) (this.beacon.material as THREE.MeshBasicNodeMaterial).opacity = 0.2 + Math.sin(this.t * 3) * 0.07;
    if (this.state !== 'step') return;
    this.t += dt; this.stepT += dt;
    const s = this.step!;
    if (this.nestedOn) { this.nested.update(dt); return; }
    if (s.kind === 'reach' && this.target && this.near(this.target, s.radius ?? 3.2)) this.next();
    else if (s.kind === 'explore' && (this.stepT >= s.seconds || (this.target && this.near(this.target, 3.2)))) this.next();
    else if (s.kind === 'clear' && this.stepT > 0.5 && this.alive() === 0) this.next();
  }

  // ── outro, clear, fail ──
  private async outro() {
    this.state = 'outro';
    this.counting = false;
    this.host.foes.clear();
    this.host.mood('victory');
    const time = this.t, kills = this.kills, downs = this.downs;
    const saved = progress.recordClear(this.campaign.id, this.chapter.n, time, kills);
    this.host.freeze(true);
    await playCards(this.chapter.outro, { hex: this.campaign.hex, kicker: this.kicker });
    this.state = 'done';
    const nextCh = this.campaign.chapters.find((c) => c.n === this.chapter.n + 1);
    showChapterResult({ won: true, time, kills, downs, best: saved.best, bestTime: saved.rec.bestTime }, {
      hex: this.campaign.hex, kicker: this.kicker, title: this.chapter.title,
      unlocked: nextCh ? `Chapter ${nextCh.n} · ${nextCh.title}` : undefined,
      buttons: [
        ...(nextCh ? [{ label: 'NEXT CHAPTER', primary: true, run: () => this.host.goto(nextCh.n) }] : []),
        { label: 'REPLAY', primary: !nextCh, run: () => this.retry() },
        { label: 'CAMPAIGN', run: () => this.host.goto(null) },
      ],
    });
  }

  fail() {
    if (this.state === 'failed' || this.state === 'done') return;
    this.state = 'failed';
    this.counting = false; this.nestedOn = false;
    this.clearBeacon();
    this.host.foes.clear();
    this.host.mood('defeat');
    this.host.freeze(true);
    showChapterResult({ won: false, time: this.t, kills: this.kills, downs: this.downs }, {
      hex: this.campaign.hex, kicker: this.kicker, title: this.chapter.title,
      buttons: [{ label: 'RETRY CHAPTER', primary: true, run: () => this.retry() }, { label: 'CAMPAIGN', run: () => this.host.goto(null) }],
    });
  }

  retry() {
    this.clearBeacon();
    this.host.respawn();
    this.host.freeze(false);
    void this.start();
  }

  // ── map helpers (arena descriptor) ──
  private spot(at: Spot): THREE.Vector3 {
    const A = this.host.arena;
    if (at === 'spawnB') return A.spawns.b.clone();
    if (at === 'far') { const a = A.spawns.a; return [...A.anchors].sort((x, y) => y.distanceToSquared(a) - x.distanceToSquared(a))[0]?.clone() ?? A.spawns.b.clone(); }
    if (at === 'center') { const c = A.bounds.center; return [...A.objectives].sort((x, y) => x.distanceToSquared(c) - y.distanceToSquared(c))[0]?.clone() ?? c.clone(); }
    if ('objective' in at) return (A.objectives[at.objective] ?? A.objectives[A.objectives.length - 1] ?? A.spawns.b).clone();
    return (A.anchors[at.anchor] ?? A.anchors[A.anchors.length - 1] ?? A.spawns.b).clone();
  }
  /** foe spots, farthest from the player first (fights open at range) */
  private farSpots() { const p = this.host.playerPos(); return [...this.host.arena.foeSpots].sort((a, b) => b.distanceToSquared(p) - a.distanceToSquared(p)); }
  private alive() { return this.host.foes.enemies.filter((e) => e.hp > 0).length; }
  private dist(v: THREE.Vector3) { const p = this.host.playerPos(); return Math.hypot(v.x - p.x, v.z - p.z); }
  private near(v: THREE.Vector3, r: number) { const p = this.host.playerPos(); return this.dist(v) < r && Math.abs(p.y - v.y) < 3.5; }

  private mark(at: THREE.Vector3, color: number) {
    this.target = at;
    const mat = new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 40, 20, 1, true), mat);
    this.beacon.name = 'campaign objective beacon vfx';
    this.beacon.position.copy(at).setY(at.y + 20);
    this.host.scene.add(this.beacon);
  }
  private clearBeacon() {
    this.target = null;
    if (this.beacon) { this.host.scene.remove(this.beacon); this.beacon.geometry.dispose(); (this.beacon.material as THREE.Material).dispose(); this.beacon = null; }
  }
}
