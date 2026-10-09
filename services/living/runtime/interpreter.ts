// The action interpreter. Knows every Action in the contract and nothing about the DOM: it talks to a RuntimeHost
// (the engine in the browser, a recorder in tests) and to a BookAudioApi (the real engine, or a mock).
//
// Sequencing: actions in a `do` list start in order, synchronously, so a tap sees its effects immediately. Only `wait`
// (and an `if` whose branch contains a wait) suspends the list; everything after it continues later unless the page was left.
import type { Action, AnimSpec, Behavior, BookAudioApi, BurstKind, Cond, HapticPattern, Scalar, Target } from '../contracts';
import { evalCond } from './conditions';
import { PAGE_ID } from './targets';
import type { VarStore } from './state';

export interface ActionCtx {
  /** The behaviour's resolved target ids: the default target of an action that names none. */
  targets: string[];
  /** Where the gesture happened, 0..1 across the page width (pan 'auto', scale: notes). */
  x01?: number;
  /** Where the gesture happened in page units (bursts without an explicit place). */
  point?: { x: number; y: number };
  behaviorId?: string;
  /** Set for press-and-hold: `note` actions without a duration become sustained voices collected here and stopped on release. */
  hold?: { voices: Array<{ stop(releaseMs?: number): void; setPitch(n: string | number, glideMs?: number): void }> };
}

export interface RuntimeHost {
  readonly vars: VarStore;
  readonly audio: BookAudioApi | null;
  reduced(): boolean;
  sound(): boolean;
  now(): number;
  resolve(t: Target | undefined, ctx: ActionCtx): string[];
  centerOf(ids: string[]): { x: number; y: number } | null;
  animate(ids: string[], spec: AnimSpec, ctx: ActionCtx): void;
  stopAnim(ids: string[]): void;
  setProps(ids: string[], props: Record<string, unknown>): void;
  visibility(ids: string[], mode: 'show' | 'hide' | 'toggle', spec?: AnimSpec): void;
  burst(at: { x: number; y: number }, kind: BurstKind, count?: number): void;
  trail(kind: BurstKind, whileVar?: string): void;
  follow(ids: string[], opts: { lagMs?: number; lookAt?: boolean; maxOffset?: number }): void;
  narrate(from?: number, to?: number): void;
  haptic(p: HapticPattern): void;
  goto(page: number | 'next' | 'prev'): void;
  emit(name: string, payload?: unknown): void;
  announce(text: string): void;
  celebrate(): void;
  sleep(ms: number): Promise<void>;
}

const AUDIO_ONLY = new Set(['sfx', 'note', 'music', 'musicStop', 'musicTempo', 'duck', 'ambience', 'depth', 'narrate', 'haptic', 'wait']);
/** True when none of the actions would change anything the reader can see (so a sound-off reader would get nothing). */
export function isAudioOnly(actions: Action[]): boolean {
  return actions.every(a => AUDIO_ONLY.has(a.do) || (a.do === 'if' && isAudioOnly(a.then) && isAudioOnly(a.else ?? [])));
}

/** `scale:C4,D4,E4,G4` -> picks one by x01 (pitch follows where you tap). Any other value passes through. */
export function pickNote(note: string | number, x01: number | undefined): string | number {
  if (typeof note !== 'string' || !note.startsWith('scale:')) return note;
  const notes = note.slice(6).split(',').map(s => s.trim()).filter(Boolean);
  if (!notes.length) return 'C4';
  const i = Math.min(notes.length - 1, Math.max(0, Math.floor((x01 ?? 0.5) * notes.length)));
  return notes[i];
}

/** The reader's `reduced` rules. Returns the action list to run for a behaviour right now. */
export function actionsFor(b: Behavior, reduced: boolean, sound: boolean): Action[] {
  if (b.reduced && (reduced || (!sound && isAudioOnly(b.do)))) return b.reduced;
  return b.do;
}

export class ActionInterpreter {
  private epoch = 0;
  private fired = new Set<string>();
  private lastAt = new Map<string, number>();
  private depthVar: string | null = null;
  private unsub: () => void;

  constructor(private host: RuntimeHost) {
    // `depth: {fromVar}` keeps following its variable.
    this.unsub = host.vars.subscribe(name => { if (name === this.depthVar) this.applyDepth(); });
  }

  dispose() { this.cancel(); this.unsub(); }
  /** Cancel every pending `wait` continuation (page left / replay). */
  cancel() { this.epoch++; }
  resetCounters() { this.fired.clear(); this.lastAt.clear(); this.depthVar = null; }

  /** Run a behaviour if its guards allow. Returns whether it fired. */
  fire(b: Behavior, ctx: ActionCtx): boolean {
    if (b.when && !evalCond(b.when, this.host.vars.get)) return false;
    if (b.once && this.fired.has(b.id)) return false;
    if (b.cooldownMs) { const last = this.lastAt.get(b.id); const now = this.host.now(); if (last !== undefined && now - last < b.cooldownMs) return false; this.lastAt.set(b.id, now); }
    this.fired.add(b.id);
    void this.run(actionsFor(b, this.host.reduced(), this.host.sound()), { ...ctx, behaviorId: b.id });
    return true;
  }

  async run(actions: Action[], ctx: ActionCtx): Promise<void> {
    const my = this.epoch;
    for (const a of actions) {
      if (my !== this.epoch) return;
      let r: Promise<void> | void;
      try { r = this.step(a, ctx); } catch (e) { console.warn('[living] action failed', a.do, e); continue; }   // one bad action never stops the page
      if (r) await r;
    }
  }

  private audio(): BookAudioApi | null { return this.host.sound() ? this.host.audio : null; }

  private applyDepth() {
    const au = this.audio(); if (!au || !this.depthVar) return;
    au.setDepth(Math.min(1, Math.max(0, this.host.vars.num(this.depthVar))));
  }

  private step(a: Action, ctx: ActionCtx): Promise<void> | void {
    const h = this.host;
    const ids = (t?: Target) => (t ? h.resolve(t, ctx) : ctx.targets);
    switch (a.do) {
      case 'animate': h.animate(ids(a.target), a.anim, ctx); return;
      case 'stop': h.stopAnim(ids(a.target)); return;
      case 'set': {
        h.setProps(ids(a.target), a.props as Record<string, unknown>);
        if (typeof a.props.text === 'string') h.announce(a.props.text);
        return;
      }
      case 'show': case 'hide': case 'toggle': h.visibility(h.resolve(a.target, ctx), a.do, a.anim); return;
      case 'sfx': this.audio()?.sfx(a.sound, { ...a.params, x01: ctx.x01 }); return;
      case 'note': {
        const au = this.audio(); if (!au) return;
        const note = pickNote(a.note, ctx.x01);
        const pan = a.pan === 'auto' || a.pan === undefined ? (ctx.x01 !== undefined ? ctx.x01 * 2 - 1 : undefined) : a.pan;
        if (ctx.hold && a.durationMs === undefined) {
          const v = au.voice(a.instrument, note, { gain: a.gain });
          if (v) ctx.hold.voices.push(v);
          return;
        }
        au.note(a.instrument, note, { durationMs: a.durationMs, gain: a.gain, pan });
        return;
      }
      case 'music': this.audio()?.playCue(a.cue, { fadeMs: a.fadeMs }); return;
      case 'musicStop': this.audio()?.stopMusic({ fadeMs: a.fadeMs }); return;
      case 'musicTempo': this.audio()?.setTempoScale(a.scale, a.rampMs); return;
      case 'duck': this.audio()?.duck(a.amount, a.ms); return;
      case 'ambience': this.audio()?.setAmbience(a.bed, { gain: a.gain, fadeMs: a.fadeMs }); return;
      case 'depth': {
        if (typeof a.value === 'number') { this.depthVar = null; this.audio()?.setDepth(Math.min(1, Math.max(0, a.value))); }
        else { this.depthVar = a.value.fromVar; this.applyDepth(); }
        return;
      }
      case 'narrate': h.narrate(a.from, a.to); return;
      case 'var': h.vars.apply(a.name, a.op, a.value as Scalar | undefined); return;
      case 'goto': h.goto(a.page); return;
      case 'burst': {
        if (h.reduced()) return;
        let at: { x: number; y: number } | null = null;
        if (a.at && 'x' in a.at) at = a.at as { x: number; y: number };
        else if (a.at) at = h.centerOf(h.resolve(a.at as Target, ctx));
        else at = ctx.point ?? h.centerOf(ctx.targets);
        if (at) h.burst(at, a.kind, a.count);
        return;
      }
      case 'trail': if (!h.reduced()) h.trail(a.kind, a.whileVar); return;
      case 'follow': h.follow(h.resolve(a.target, ctx), { lagMs: a.lagMs, lookAt: a.lookAt, maxOffset: a.maxOffset }); return;
      case 'haptic': h.haptic(a.pattern); return;
      case 'emit': h.emit(a.name, a.payload); return;
      case 'wait': {
        const my = this.epoch;
        return h.sleep(a.ms).then(() => { if (my !== this.epoch) throw new Cancelled(); }).catch(e => { if (!(e instanceof Cancelled)) throw e; this.cancelRest(); });
      }
      case 'if': {
        const branch = evalCond(a.cond as Cond, h.vars.get) ? a.then : (a.else ?? []);
        return this.run(branch, ctx);
      }
      case 'celebrate': {
        h.celebrate();
        this.audio()?.sfx('success-jingle');
        h.haptic('success');
        return;
      }
    }
  }

  /** A cancelled wait must stop the remainder of its list: bump the epoch so `run`'s loop exits. */
  private cancelRest() { this.epoch++; }
}

class Cancelled extends Error {}
export { PAGE_ID };
