// mediaEngine/autoDirector.ts — Smart Director's brain, driving the real switcher.
//
// The same decision engine the Sports Director uses for phone cameras (services/directorEngine:
// motion scoring + EMA smoothing + minimum-shot / cooldown / hysteresis rules) pointed at the
// Control Room's switcher inputs instead of a Firestore roster. This is the "advanced setup"
// link: a school with real cameras into a switcher can still let the director call the game.
//
// Modes:
//   off    — nothing happens.
//   assist — the director only CUES PREVIEW; the operator decides when to TAKE.
//   auto   — the director cues preview and runs AUTO with the switcher's own transition.
// Any operator TAKE/CUT while in auto holds the director off for `holdMs` (default 10 s) —
// the human always wins, and the director picks up again on its own.
//
// External drive: a Sports Director production can push its decisions in with
// `followExternal(destId)` (e.g. the director running on another device).

import type { MediaEngine, AutoDirectorMode } from './engine';
import { createFrameClock, FrameClock } from './frameClock';
import { acquireStreamVideo, releaseStreamVideo } from './streamVideo';
import { DirectorEngine, createMotionScorer, type FeedActivity, type MotionScorer } from '../directorEngine';
import type { DirectionState, ProductionSettings } from '../smartDirectorService';

export interface AutoDirectorOptions {
  settings?: ProductionSettings;
  /** How long an operator override pauses auto mode. */
  holdMs?: number;
}

const registry = new WeakMap<MediaEngine, AutoDirector>();

export class AutoDirector {
  /** One director per engine — the Sports Director and an embedded Control Room share it. */
  static for(engine: MediaEngine, opts?: AutoDirectorOptions): AutoDirector {
    let d = registry.get(engine);
    if (!d) { d = new AutoDirector(engine, opts); registry.set(engine, d); }
    return d;
  }

  /** Change shot-timing knobs live (from the production's settings). */
  setSettings(settings: ProductionSettings) { this.settings = settings; }

  private brain = new DirectorEngine({ smoothing: 0.3 });
  private scorers = new Map<string, { scorer: MotionScorer; stream: MediaStream; el: HTMLVideoElement }>();
  private clock: FrameClock | null = null;
  private lastOnAt = new Map<string, number>();
  private lastSwitchAt = 0;
  private settings: ProductionSettings;
  private holdMs: number;
  private unsub: (() => void) | null = null;
  private lastSeenTake = 0;

  constructor(private engine: MediaEngine, opts: AutoDirectorOptions = {}) {
    this.settings = opts.settings ?? { minShotMs: 3500, cooldownMs: 1200 };
    this.holdMs = opts.holdMs ?? 10_000;
  }

  get mode(): AutoDirectorMode { return this.engine.getState().director.mode; }

  setMode(mode: AutoDirectorMode) {
    this.engine.setDirectorStatus({ mode, reason: mode === 'off' ? undefined : 'Watching the inputs…', heldUntil: undefined });
    if (mode === 'off') this.stop(); else this.start();
  }

  /** Apply a decision made elsewhere (a Sports Director on another device). */
  followExternal(destId: string, reason = 'Following Sports Director') {
    const { switcher } = this.engine.getState();
    if (destId === switcher.program) return;
    this.engine.asDirector(() => {
      this.engine.setPreview(destId);
      if (this.mode === 'auto') this.engine.auto();
    });
    this.engine.setDirectorStatus({ reason });
  }

  dispose() { this.stop(); if (registry.get(this.engine) === this) registry.delete(this.engine); }

  private start() {
    if (this.clock) return;
    this.lastSeenTake = this.engine.lastTake?.at ?? 0;
    this.clock = createFrameClock(4, () => this.tick()); // ~4 Hz is plenty for shot decisions
    this.unsub = this.engine.subscribe(() => this.watchOverride());
  }

  private stop() {
    this.clock?.stop(); this.clock = null;
    this.unsub?.(); this.unsub = null;
    for (const { scorer, stream } of this.scorers.values()) { scorer.dispose(); releaseStreamVideo(stream); }
    this.scorers.clear();
    this.brain.reset();
  }

  /** An operator take while we're in auto → hold off. */
  private watchOverride() {
    const t = this.engine.lastTake;
    if (!t || t.at === this.lastSeenTake) return;
    this.lastSeenTake = t.at;
    if (t.by === 'director') { this.lastSwitchAt = t.at; return; }
    if (this.mode === 'auto') {
      this.engine.setDirectorStatus({ heldUntil: Date.now() + this.holdMs, reason: 'Operator took over — holding' });
    }
    this.lastSwitchAt = t.at;
  }

  private scorerFor(destId: string, stream: MediaStream): { scorer: MotionScorer; el: HTMLVideoElement } {
    const hit = this.scorers.get(destId);
    if (hit && hit.stream === stream) return hit;
    if (hit) { hit.scorer.dispose(); releaseStreamVideo(hit.stream); }
    const entry = { scorer: createMotionScorer(), stream, el: acquireStreamVideo(stream) };
    this.scorers.set(destId, entry);
    return entry;
  }

  private tick() {
    const state = this.engine.getState();
    const { mode, heldUntil } = state.director;
    if (mode === 'off') return;
    if (this.engine.inTransition) return;              // never fight a transition in flight
    const now = Date.now();
    if (heldUntil && now < heldUntil) return;
    if (heldUntil) this.engine.setDirectorStatus({ heldUntil: undefined, reason: 'Back on auto' });

    const { router, switcher } = state;
    const activity: FeedActivity[] = [];
    for (const destId of switcher.inputs) {
      const src = router.sources.find(s => s.id === router.routes[destId]);
      if (!src?.stream) continue;
      const { scorer, el } = this.scorerFor(destId, src.stream);
      activity.push({
        feedId: destId,
        activityScore: scorer.score(el),
        role: 'camera',
        lastOnAt: this.lastOnAt.get(destId),
        active: src.connected !== false,
      });
    }
    if (activity.length < 2) return;

    this.lastOnAt.set(switcher.program, now);
    const direction: DirectionState = {
      programFeedId: switcher.program,
      mode: 'AUTO',
      lastSwitchAt: this.lastSwitchAt || now,
      updatedBy: 'auto-director',
    } as DirectionState;
    const decision = this.brain.decide(activity, direction, this.settings, now);
    if (!decision || decision.programFeedId === switcher.program) return;

    const label = state.router.destinations.find(d => d.id === decision.programFeedId)?.label ?? decision.programFeedId;
    if (mode === 'assist') {
      if (switcher.preview !== decision.programFeedId) {
        this.engine.asDirector(() => this.engine.setPreview(decision.programFeedId));
        this.engine.setDirectorStatus({ reason: `Suggests ${label} — ${decision.reason}` });
      }
      return;
    }
    this.engine.asDirector(() => {
      this.engine.setPreview(decision.programFeedId);
      this.engine.auto();
    });
    this.lastSwitchAt = now;
    this.engine.setDirectorStatus({ reason: `${label} — ${decision.reason}` });
  }
}
