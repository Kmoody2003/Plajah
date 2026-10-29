// Chora Session Band live — a character's director. One per character on screen. It listens to the
// studio (through an instrument lens), decides when the character speaks, plays or stays quiet, and
// runs the conversation when you talk to them. Like a game character's behaviour loop:
//
//   perceive (lens observations) → choose (sheet reactions: chattiness, priority, cooldowns,
//   never talk over the player) → act (speak with word-timed captions, gesture, demo on the
//   instrument) → listen (your question → the band mind → spoken answer).
//
// Everything that touches the outside world (voice, the AI mind, the instrument, the clock) is
// injected, so the behaviour is testable without audio or a browser.

import type { CharacterSheet, AvatarState, Demo, Gesture, Reaction } from '../character/schema';
import type { Lens, Observation } from './observations';
import { liveBus, type LiveEvent } from './events';
import type { MindReply } from '../bandMind';
import type { TeacherTurn } from '../teacherPrompt';

export type Chattiness = 1 | 2 | 3;

export interface LiveSnapshot {
  state: AvatarState;
  /** What they're saying (or last said). */
  caption: string;
  /** Words of `caption` spoken so far (for highlight + mouth). */
  spokenWords: number;
  /** Who said the caption — the character, or the user's words being answered. */
  from: 'character' | 'user';
  gesture: Gesture | null;
  /** performance.now() of the gesture, so the UI can animate it once. */
  gestureAt: number;
  /** Bumps on every hit the character hears (the UI nods along). */
  beat: number;
  lane: MindReply['lane'] | null;
  note: string | null;
  history: TeacherTurn[];
}

export interface DirectorDeps {
  sheet: CharacterSheet;
  lens: Lens;
  /** Say text aloud (or caption-only); call onWord with each word index as it's spoken. Must resolve. */
  speak: (text: string, onWord: (i: number) => void, signal: AbortSignal) => Promise<void>;
  /** Ask the AI mind (bandMind.askPlayer). */
  ask: (history: TeacherTurn[], screen: string, signal: AbortSignal) => Promise<MindReply>;
  /** Play a demo on the host instrument; resolves when done. */
  perform?: (demo: Demo, signal: AbortSignal) => Promise<void>;
  /** Extra template values / screen description for an observation (e.g. the drum's intro on preset change). */
  enrich?: (o: Observation) => Record<string, string | number>;
  /** One line describing what's on screen, for the mind. */
  screen?: () => string;
  clock: () => number;
  random?: () => number;
}

/** Minimum gap between unprompted remarks, by chattiness (priority ≥ 8 — greetings, new instrument — ignores it). */
const GAP_MS: Record<Chattiness, number> = { 1: 30_000, 2: 12_000, 3: 6_000 };
/** How long after your last hit counts as a pause they can talk in. */
const PAUSE_MS = 1_300;

export class LiveDirector {
  private snap: LiveSnapshot = { state: 'idle', caption: '', spokenWords: 0, from: 'character', gesture: null, gestureAt: 0, beat: 0, lane: null, note: null, history: [] };
  private listeners = new Set<(s: LiveSnapshot) => void>();
  private cooldown = new Map<Reaction, number>();
  private lastRemark = -Infinity;
  private lastHit = -Infinity;
  private busy: AbortController | null = null;
  private off: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  chattiness: Chattiness = 2;

  constructor(private deps: DirectorDeps) {}

  get snapshot(): LiveSnapshot { return this.snap; }
  onChange(cb: (s: LiveSnapshot) => void): () => void { this.listeners.add(cb); cb(this.snap); return () => { this.listeners.delete(cb); }; }
  private set(p: Partial<LiveSnapshot>) { this.snap = { ...this.snap, ...p }; for (const l of this.listeners) l(this.snap); }

  /** Start listening to the studio. `tickMs` 0 = no timer (tests call tick() themselves). */
  start(tickMs = 600): void {
    this.off = liveBus.on((e) => this.feed(e));
    if (tickMs > 0) this.timer = setInterval(() => this.tick(), tickMs);
  }
  stop(): void {
    this.off?.(); this.off = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.interrupt();
  }

  feed(e: LiveEvent): void {
    // Their own demo hits come back through the studio too — those aren't the learner's playing.
    if (this.snap.state === 'playing' && e.kind === 'strike') { this.set({ beat: this.snap.beat + 1 }); return; }
    this.deps.lens.feed(e);
    if (e.kind === 'strike') {
      this.lastHit = e.at;
      this.set({ beat: this.snap.beat + 1, ...(this.snap.state === 'idle' ? { state: 'watching' as const } : {}) });
    }
  }

  /** Stop whatever they're saying or playing. */
  interrupt(): void {
    this.busy?.abort();
    this.busy = null;
    if (this.snap.state !== 'listening') this.set({ state: 'idle' });
  }

  /** The user is talking (mic open): stop and listen. */
  listen(on: boolean): void {
    if (on) { this.interrupt(); this.set({ state: 'listening' }); }
    else if (this.snap.state === 'listening') this.set({ state: 'idle' });
  }

  /** One behaviour step: notice, choose, act. */
  tick(): void {
    const t = this.deps.clock();
    const st = this.snap.state;
    if (st === 'listening' || st === 'thinking' || st === 'speaking' || st === 'playing') return;
    if (st === 'watching' && t - this.lastHit > PAUSE_MS * 3) this.set({ state: 'idle' });

    const obs = this.deps.lens.observe(t);
    const pick = this.choose(obs, t);
    if (!pick) return;
    void this.act(pick.reaction, pick.obs, t);
  }

  private choose(obs: Observation[], t: number): { reaction: Reaction; obs: Observation } | null {
    const playing = t - this.lastHit < PAUSE_MS;
    let best: { reaction: Reaction; obs: Observation } | null = null;
    for (const o of obs) {
      for (const r of this.deps.sheet.reactions) {
        if (r.on !== o.id || r.chattiness > this.chattiness || !r.say.length) continue;
        if (t - (this.cooldown.get(r) ?? -Infinity) < r.cooldownS * 1000) continue;
        const urgent = r.priority >= 8;
        if (!urgent && (playing || t - this.lastRemark < GAP_MS[this.chattiness])) continue;
        if (!best || r.priority > best.reaction.priority) best = { reaction: r, obs: o };
      }
    }
    return best;
  }

  private fill(line: string, o: Observation): string {
    const first = this.deps.sheet.displayName.split(' ')[0];
    const data: Record<string, string | number> = { name: first, ...o.data, ...(this.deps.enrich?.(o) ?? {}) };
    return line.replace(/\{(\w+)\}/g, (_, k) => (data[k] !== undefined ? String(data[k]) : '')).replace(/\s+/g, ' ').trim();
  }

  private async act(r: Reaction, o: Observation, t: number): Promise<void> {
    this.cooldown.set(r, t);
    this.lastRemark = t;
    const rnd = this.deps.random ?? Math.random;
    const line = this.fill(r.say[Math.floor(rnd() * r.say.length)], o);
    // A demo that goes with this observation (its own cooldown), played right after the remark.
    const demoR = this.deps.sheet.reactions.find((x) => x.on === r.on && x.demo && x.chattiness <= this.chattiness
      && t - (this.cooldown.get(x) ?? -Infinity) >= x.cooldownS * 1000);
    const demo = (r.demo ?? demoR?.demo) ? this.deps.sheet.demos.find((d) => d.id === (r.demo ?? demoR?.demo)) : undefined;
    if (demoR && demo) this.cooldown.set(demoR, t);
    if (line) await this.say(line, r.gesture ?? null);
    if (demo && this.snap.state === 'idle') await this.demo(demo.id);
  }

  /** Speak a line now (cancels anything in progress). */
  async say(text: string, gesture: Gesture | null = null, from: 'character' | 'user' = 'character'): Promise<void> {
    this.busy?.abort();
    const ctrl = new AbortController();
    this.busy = ctrl;
    this.set({ state: 'speaking', caption: text, spokenWords: 0, from, gesture, gestureAt: gesture ? this.deps.clock() : this.snap.gestureAt });
    try { await this.deps.speak(text, (i) => { if (!ctrl.signal.aborted) this.set({ spokenWords: i + 1 }); }, ctrl.signal); }
    catch { /* a voice failure must not break the character */ }
    if (this.busy === ctrl) {
      this.busy = null;
      this.set({ state: 'idle', spokenWords: text.split(/\s+/).length });
    }
  }

  /** Play one of their demos on the instrument. */
  async demo(id: string): Promise<void> {
    const d = this.deps.sheet.demos.find((x) => x.id === id);
    if (!d || !this.deps.perform) return;
    this.busy?.abort();
    const ctrl = new AbortController();
    this.busy = ctrl;
    this.set({ state: 'playing', gesture: 'count-in', gestureAt: this.deps.clock() });
    try { await this.deps.perform(d, ctrl.signal); } catch { /* instrument unavailable */ }
    if (this.busy === ctrl) { this.busy = null; this.set({ state: 'idle' }); }
    this.lastRemark = this.deps.clock();
  }

  /** The user said or typed something to the character. */
  async hear(text: string): Promise<void> {
    const q = text.trim();
    if (!q) return;
    this.busy?.abort();
    const ctrl = new AbortController();
    this.busy = ctrl;
    const history: TeacherTurn[] = [...this.snap.history, { role: 'user' as const, content: q }].slice(-12);
    this.set({ state: 'thinking', history, caption: q, from: 'user', gesture: 'think', gestureAt: this.deps.clock() });

    // "Show me …" asks for a demo they know.
    const wantDemo = /\b(show|play|demo|demonstrate)\b/i.test(q)
      ? this.deps.sheet.demos.find((d) => q.toLowerCase().includes(d.label.toLowerCase()) || q.toLowerCase().includes(d.id.replace(/-/g, ' ')))
      : undefined;

    const screen = [this.deps.screen?.(), `What they're playing: ${this.deps.lens.summary(this.deps.clock())}.`].filter(Boolean).join(' ');
    let reply: MindReply;
    try { reply = await this.deps.ask(history, screen, ctrl.signal); }
    catch { if (ctrl.signal.aborted) return; reply = { text: 'Sorry — I lost my train of thought. Ask me again?', lane: 'built-in' }; }
    if (ctrl.signal.aborted || this.busy !== ctrl) return;
    this.busy = null;
    this.set({ history: [...history, { role: 'assistant' as const, content: reply.text }].slice(-12), lane: reply.lane, note: reply.note ?? null });
    this.lastRemark = this.deps.clock();
    await this.say(reply.text, 'lean-in');
    if (wantDemo && this.snap.state === 'idle') await this.demo(wantDemo.id);
  }
}
