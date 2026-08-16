// serviceRunner — the run of show, its timers, and what slides actually DO.
//
// A service is not one deck. It is a countdown, three songs, an announcement
// loop, a scripture reading, the message, and a response — each its own show,
// in an order the team agreed on Thursday. Until Ambo models that, an operator
// is opening files mid-service, which is exactly the failure mode a run of show
// exists to prevent.
//
// Timers are here rather than in the UI because three surfaces need the same
// number at the same instant: the stage display counting the speaker down, the
// countdown slide on the program, and the operator's own clock. One source.

import {
  applySlide, clearLayer, flattenArrangement,
  type Action, type LayerSlot, type LiveStack, type Show, type Slide,
} from './showModel';

// ── The plan ─────────────────────────────────────────────────────────────────

export type ServiceItemKind =
  | 'COUNTDOWN' | 'SONG' | 'SCRIPTURE' | 'MESSAGE'
  | 'ANNOUNCEMENT' | 'RESPONSE' | 'MEDIA' | 'BLANK';

export interface ServiceItem {
  id: string;
  kind: ServiceItemKind;
  title: string;
  show?: Show;
  /** Planned length — drives the "are we running long" maths. */
  plannedSec?: number;
  /** Who is responsible. Shows on the stage display and the team's run sheet. */
  owner?: string;
  notes?: string;
  done?: boolean;
}

export interface ServicePlan {
  id: string;
  title: string;
  /** Epoch ms of the intended start — count-to-time timers key off this. */
  startsAt?: number;
  items: ServiceItem[];
}

/** Total planned runtime, for the "we are 6 minutes long" readout. */
export function plannedRuntimeSec(plan: ServicePlan): number {
  return plan.items.reduce((n, i) => n + (i.plannedSec ?? 0), 0);
}

/** Every slide in the service, in order — what a linear "next" walks. */
export function flattenPlan(plan: ServicePlan): Array<{ item: ServiceItem; slide: Slide }> {
  const out: Array<{ item: ServiceItem; slide: Slide }> = [];
  for (const item of plan.items) {
    if (!item.show) continue;
    for (const slide of flattenArrangement(item.show)) out.push({ item, slide });
  }
  return out;
}

// ── Timers ───────────────────────────────────────────────────────────────────

export type TimerKind = 'COUNTDOWN' | 'ELAPSED' | 'TO_TIME';

export interface Timer {
  id: string;
  name: string;
  kind: TimerKind;
  /** COUNTDOWN: how long. */
  durationSec?: number;
  /** TO_TIME: epoch ms to count towards — "on screen at 10:00". */
  targetAt?: number;
  running: boolean;
  /** Epoch ms the current run began. */
  startedAt?: number;
  /** Accumulated seconds from previous runs, so pause/resume is honest. */
  accumulatedSec?: number;
  /** Keep counting past zero, negative — the speaker is over. */
  overrun?: boolean;
}

/**
 * The value of a timer right now, in seconds. Pure, so the stage display, the
 * program slide and the operator's clock cannot disagree.
 *
 * COUNTDOWN and TO_TIME go negative once passed when `overrun` is set, which is
 * the number a speaker actually needs — "how far over am I" beats a frozen zero.
 */
export function timerValue(t: Timer, now: number): number {
  const ranSec = (t.accumulatedSec ?? 0) + (t.running && t.startedAt ? (now - t.startedAt) / 1000 : 0);

  if (t.kind === 'ELAPSED') return Math.max(0, ranSec);

  if (t.kind === 'TO_TIME') {
    if (!t.targetAt) return 0;
    const v = (t.targetAt - now) / 1000;
    return t.overrun ? v : Math.max(0, v);
  }

  const v = (t.durationSec ?? 0) - ranSec;
  return t.overrun ? v : Math.max(0, v);
}

export function startTimer(t: Timer, now: number): Timer {
  if (t.running) return t;
  return { ...t, running: true, startedAt: now };
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (!t.running) return t;
  const ran = t.startedAt ? (now - t.startedAt) / 1000 : 0;
  return { ...t, running: false, startedAt: undefined, accumulatedSec: (t.accumulatedSec ?? 0) + ran };
}

export function resetTimer(t: Timer): Timer {
  return { ...t, running: false, startedAt: undefined, accumulatedSec: 0 };
}

/** Seconds → the string every surface shows. Negative reads as -1:23. */
export function formatTimer(seconds: number): string {
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

/** Snapshot for broadcast to outputs — the wire wants numbers, not objects. */
export function timerSnapshot(timers: Timer[], now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of timers) out[t.id] = timerValue(t, now);
  return out;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export interface ActionContext {
  stack: LiveStack;
  timers: Timer[];
  now: number;
  /** Slide lookup for GOTO. */
  slideById?: (id: string) => Slide | undefined;
}

export interface ActionResult {
  stack: LiveStack;
  timers: Timer[];
  /** A GOTO asks the caller to move — the runner does not own the cursor. */
  gotoSlideId?: string;
  /** Macros and switcher cuts are dispatched, not executed here. */
  dispatched: Array<{ kind: string; payload?: unknown }>;
}

/**
 * Run a slide's actions. Pure: it returns the next state rather than mutating,
 * so the same code drives the live console, a preview "what would this do", and
 * tests.
 */
export function runActions(actions: Action[] | undefined, ctx: ActionContext): ActionResult {
  let stack = ctx.stack;
  let timers = ctx.timers;
  const dispatched: ActionResult['dispatched'] = [];
  let gotoSlideId: string | undefined;

  for (const a of actions ?? []) {
    switch (a.kind) {
      case 'CLEAR_LAYER':
        stack = clearLayer(stack, a.slot as LayerSlot);
        break;

      case 'TIMER_START':
        timers = timers.map(t => (t.id === a.timerId
          ? startTimer(a.seconds != null ? { ...t, durationSec: a.seconds, accumulatedSec: 0 } : t, ctx.now)
          : t));
        break;

      case 'TIMER_RESET':
        timers = timers.map(t => (t.id === a.timerId ? resetTimer(t) : t));
        break;

      case 'AUDIO_PLAY':
        // Audio is a layer, so playing one is applying a layer — that way it
        // gets the same lifecycle, fade and single-owner rules as everything else.
        stack = applySlide(stack, {
          id: `act_audio_${a.src}`,
          layers: [{ id: `ly_audio`, slot: 'overlay', content: { kind: 'AUDIO', src: a.src, volume: a.volume ?? 1 } }],
        }, ctx.now);
        break;

      case 'AUDIO_STOP':
        stack = clearLayer(stack, 'overlay');
        break;

      case 'PROP_SHOW':
        dispatched.push({ kind: 'PROP_SHOW', payload: a.propId });
        break;
      case 'PROP_HIDE':
        stack = clearLayer(stack, 'prop');
        break;

      case 'GOTO':
        gotoSlideId = a.slideId;
        break;

      case 'MACRO':
        dispatched.push({ kind: 'MACRO', payload: a.macroId });
        break;
      case 'SWITCHER_CUT':
        dispatched.push({ kind: 'SWITCHER_CUT', payload: a.sourceId });
        break;
      case 'CUE':
        dispatched.push({ kind: 'CUE', payload: a.refId });
        break;
    }
  }

  return { stack, timers, gotoSlideId, dispatched };
}

// ── Walking the service ──────────────────────────────────────────────────────

export interface RunnerState {
  plan: ServicePlan;
  /** Index into flattenPlan(). -1 = nothing taken yet. */
  cursor: number;
  stack: LiveStack;
  timers: Timer[];
}

/**
 * Take the slide at `index`: run its exit actions, apply it, run its enter
 * actions. Returns the next state and anything the host must dispatch.
 */
export function takeSlideAt(state: RunnerState, index: number, now: number): RunnerState & { dispatched: ActionResult['dispatched'] } {
  const flat = flattenPlan(state.plan);
  const entry = flat[index];
  if (!entry) return { ...state, dispatched: [] };

  const prev = flat[state.cursor]?.slide;
  const byId = (id: string) => flat.find(f => f.slide.id === id)?.slide;

  let stack = state.stack;
  let timers = state.timers;
  const dispatched: ActionResult['dispatched'] = [];

  if (prev && prev.id !== entry.slide.id) {
    const exit = runActions(prev.onExit, { stack, timers, now, slideById: byId });
    stack = exit.stack; timers = exit.timers; dispatched.push(...exit.dispatched);
  }

  stack = applySlide(stack, entry.slide, now);

  const enter = runActions(entry.slide.onEnter, { stack, timers, now, slideById: byId });
  stack = enter.stack; timers = enter.timers; dispatched.push(...enter.dispatched);

  const goto = enter.gotoSlideId ? flat.findIndex(f => f.slide.id === enter.gotoSlideId) : -1;

  return {
    ...state,
    cursor: goto >= 0 ? goto : index,
    stack,
    timers,
    dispatched,
  };
}

export function nextIndex(state: RunnerState): number {
  const total = flattenPlan(state.plan).length;
  return Math.min(total - 1, state.cursor + 1);
}

export function prevIndex(state: RunnerState): number {
  return Math.max(0, state.cursor - 1);
}

/** The slide after the current one — what the stage display previews. */
export function nextSlide(state: RunnerState): Slide | null {
  const flat = flattenPlan(state.plan);
  return flat[state.cursor + 1]?.slide ?? null;
}

/** Which service item we're inside, for the run-sheet highlight. */
export function currentItem(state: RunnerState): ServiceItem | null {
  return flattenPlan(state.plan)[state.cursor]?.item ?? null;
}

export const makeTimer = (id: string, name: string, kind: TimerKind, over: Partial<Timer> = {}): Timer => ({
  id, name, kind, running: false, accumulatedSec: 0, ...over,
});
