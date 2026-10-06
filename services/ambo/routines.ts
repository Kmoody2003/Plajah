// routines — scheduled / triggered automation for Ambo.
//
// A church service is the same dozen moves every week: fifteen minutes out the
// countdown starts and the playlist plays; at zero the opening track, the
// visualizer and the first song fire. This module models those moves so nobody
// has to remember them at 8:40 on a Sunday.
//
// Everything here is PURE or clock-injected so it is testable without a DOM:
//   · recurrence maths (timezone + DST safe, no libraries)
//   · dueRoutines(): what should fire now, with a missed-while-closed policy
//   · ActionRegistry: every step is a registered, argument-schema'd function
//   · RoutineEngine: state + run log + countdown events, storage injectable
// The presenter supplies a RoutineHost (its real handlers); see routineHost.ts.

import type { Action } from './showModel';

// ── Model ────────────────────────────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  address?: string;
  /** Output layout preset applied when a service at this location starts. */
  outputPresetId?: string;
  /** IANA zone, e.g. America/Chicago. */
  timezone: string;
}

export interface ServiceTime {
  id: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Local wall-clock time at the location, 'HH:MM' (24h). */
  time: string;
  durationMin: number;
  locationId: string;
  planId?: string;
  enabled?: boolean;
  /** 'YYYY-MM-DD' dates this service does not happen (holiday, snow day). */
  skipDates?: string[];
}

export type RoutineEventName = 'countdown-ended' | 'slide-entered' | 'routine-finished';

export type RoutineTrigger =
  | { kind: 'manual' }
  | { kind: 'once'; at: number }
  | {
      kind: 'weekly';
      days: number[];
      time: string;
      timezone?: string;
      /** 'YYYY-MM-DD' exceptions. */
      skipDates?: string[];
      startDate?: string;
      endDate?: string;
    }
  | { kind: 'service'; serviceTimeId: string; /** minutes; -15 = fifteen minutes before. */ offsetMin: number }
  | { kind: 'event'; event: RoutineEventName; /** timerId / slideId / routineId; omitted = any. */ key?: string };

export interface RoutineStep {
  id: string;
  /** Registered action name, e.g. 'slide.take'. */
  fn: string;
  args: Record<string, any>;
  /** Start together with the previous step instead of after it. */
  parallel?: boolean;
  /** Wait this long before this step begins. */
  delaySec?: number;
  enabled?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RoutineTrigger;
  steps: RoutineStep[];
  locationId?: string;
  /** Run late if the app was closed at fire time, up to this many minutes. Default 5. */
  graceMin?: number;
  stopOnError?: boolean;
  notes?: string;
}

export interface RoutineData {
  version: 1;
  routines: Routine[];
  serviceTimes: ServiceTime[];
  locations: Location[];
  /** Scheduled-time (epoch ms) of the last occurrence handled — run OR skipped. */
  lastRun: Record<string, number>;
  log: RunLogEntry[];
  countdowns: Countdown[];
}

export interface Countdown { id: string; label: string; endsAt: number; startedAt: number; }

export interface StepLog { fn: string; ok: boolean; error?: string; ms: number; }

export interface RunLogEntry {
  id: string;
  routineId: string;
  routineName: string;
  at: number;
  reason: 'schedule' | 'manual' | 'event' | 'nested' | 'missed';
  ok: boolean;
  note?: string;
  steps: StepLog[];
}

export const DEFAULT_GRACE_MIN = 5;
export const MAX_NEST_DEPTH = 5;
export const MAX_LOG = 100;

let idCounter = 0;
export const rid = (p: string) => `${p}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const emptyData = (): RoutineData => ({
  version: 1, routines: [], serviceTimes: [], locations: [], lastRun: {}, log: [], countdowns: [],
});

// ── Time zones (Intl only, DST-safe) ─────────────────────────────────────────

export const localTimezone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export interface WallClock { y: number; m: number; d: number; h: number; mi: number; s: number; dow: number; }

/** The wall-clock reading in `tz` at instant `ms`. */
export function wallClock(ms: number, tz: string): WallClock {
  const p: Record<string, number> = {};
  for (const part of dtf(tz).formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  const h = p.hour === 24 ? 0 : p.hour;
  return { y: p.year, m: p.month, d: p.day, h, mi: p.minute, s: p.second, dow: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

/** zone offset (wall - utc) in ms at an instant. */
function tzOffsetMs(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which `tz`'s wall clock reads y-m-d h:mi.
 *  · Ambiguous time (autumn fall-back): the EARLIER instant.
 *  · Non-existent time (spring-forward gap): the first instant after the gap.
 */
export function zonedTimeToEpoch(y: number, m: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi, 0);
  const cands = Array.from(new Set([guess - tzOffsetMs(guess - 86400000, tz), guess - tzOffsetMs(guess + 86400000, tz), guess - tzOffsetMs(guess, tz)]));
  const exact = cands.filter(t => {
    const w = wallClock(t, tz);
    return w.y === y && w.m === m && w.d === d && w.h === h && w.mi === mi;
  });
  if (exact.length) return Math.min(...exact);
  return Math.max(...cands);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const dateKey = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
function addDays(y: number, m: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}
export function parseHHMM(s: string): { h: number; mi: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : { h, mi };
}

// ── Recurrence ───────────────────────────────────────────────────────────────

export interface ScheduleContext {
  serviceTimes: ServiceTime[];
  locations: Location[];
}

const DAY_MS = 86400000;

interface WeeklySpec { days: number[]; time: string; tz: string; skip?: string[]; startDate?: string; endDate?: string; }

function weeklyOccurrences(spec: WeeklySpec, fromExcl: number, toIncl: number): number[] {
  const t = parseHHMM(spec.time);
  if (!t || toIncl <= fromExcl || !spec.days.length) return [];
  const a = wallClock(fromExcl, spec.tz);
  const b = wallClock(toIncl, spec.tz);
  const span = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
  const out: number[] = [];
  for (let i = -1; i <= span + 1; i++) {
    const c = addDays(a.y, a.m, a.d, i);
    if (!spec.days.includes(c.dow)) continue;
    const key = dateKey(c.y, c.m, c.d);
    if (spec.skip?.includes(key)) continue;
    if (spec.startDate && key < spec.startDate) continue;
    if (spec.endDate && key > spec.endDate) continue;
    const at = zonedTimeToEpoch(c.y, c.m, c.d, t.h, t.mi, spec.tz);
    if (at > fromExcl && at <= toIncl) out.push(at);
  }
  return out.sort((x, y) => x - y);
}

export function locationTimezone(ctx: ScheduleContext, locationId?: string): string {
  return ctx.locations.find(l => l.id === locationId)?.timezone || localTimezone();
}

/** Every scheduled fire time in (fromExcl, toIncl] for a routine. Event/manual → []. */
export function occurrencesBetween(r: Routine, ctx: ScheduleContext, fromExcl: number, toIncl: number): number[] {
  const tr = r.trigger;
  switch (tr.kind) {
    case 'once': return tr.at > fromExcl && tr.at <= toIncl ? [tr.at] : [];
    case 'weekly':
      return weeklyOccurrences({
        days: tr.days, time: tr.time, tz: tr.timezone || locationTimezone(ctx, r.locationId),
        skip: tr.skipDates, startDate: tr.startDate, endDate: tr.endDate,
      }, fromExcl, toIncl);
    case 'service': {
      const st = ctx.serviceTimes.find(s => s.id === tr.serviceTimeId);
      if (!st || st.enabled === false) return [];
      const off = (tr.offsetMin || 0) * 60000;
      return weeklyOccurrences({ days: [st.weekday], time: st.time, tz: locationTimezone(ctx, st.locationId), skip: st.skipDates },
        fromExcl - off, toIncl - off).map(t => t + off);
    }
    default: return [];
  }
}

/** The next fire time strictly after `after`, or null (searches ~15 months). */
export function nextRunAt(r: Routine, ctx: ScheduleContext, after: number): number | null {
  if (r.trigger.kind === 'manual' || r.trigger.kind === 'event') return null;
  if (r.trigger.kind === 'once') return r.trigger.at > after ? r.trigger.at : null;
  for (let i = 0; i < 70; i++) {
    const from = after + i * 7 * DAY_MS;
    const occ = occurrencesBetween(r, ctx, from, from + 7 * DAY_MS);
    if (occ.length) return occ[0];
  }
  return null;
}

export interface DueRoutine {
  routine: Routine;
  scheduledAt: number;
  lateMs: number;
  /** false = missed beyond the grace window: record it, do not run it. */
  run: boolean;
  /** Earlier occurrences collapsed into this one (app closed for days). */
  collapsed: number;
}

export interface DueOptions { defaultGraceMin?: number; lookbackMs?: number; }

/**
 * Pure scheduler tick. For each enabled time-triggered routine, find the latest
 * occurrence in (lastRun, now]. Within the grace window it runs; older, it is
 * skipped (a 9:00 countdown must not start at 10:45 because the app was open late).
 * The caller stores lastRun[id] = scheduledAt for BOTH outcomes.
 */
export function dueRoutines(
  routines: Routine[], ctx: ScheduleContext, now: number, lastRun: Record<string, number>, opts: DueOptions = {},
): DueRoutine[] {
  const out: DueRoutine[] = [];
  const lookback = opts.lookbackMs ?? DAY_MS;
  for (const r of routines) {
    if (!r.enabled || r.trigger.kind === 'manual' || r.trigger.kind === 'event') continue;
    const since = Math.max(lastRun[r.id] ?? 0, now - lookback);
    const occ = occurrencesBetween(r, ctx, since, now);
    if (!occ.length) continue;
    const at = occ[occ.length - 1];
    const graceMs = (r.graceMin ?? opts.defaultGraceMin ?? DEFAULT_GRACE_MIN) * 60000;
    out.push({ routine: r, scheduledAt: at, lateMs: now - at, run: now - at <= graceMs, collapsed: occ.length - 1 });
  }
  return out;
}

// ── Action registry ──────────────────────────────────────────────────────────

export type ArgKind = 'text' | 'number' | 'bool' | 'select';
export type ArgRef = 'show' | 'output' | 'layout' | 'routine' | 'serviceTime' | 'project' | 'slot' | 'playlist' | 'visualizer' | 'look';

export interface ArgSpec {
  key: string;
  label: string;
  kind: ArgKind;
  optional?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  /** What list of things this id comes from, so the UI can offer a picker. */
  ref?: ArgRef;
  placeholder?: string;
}

/** What the presenter provides. Every method is optional: a missing one makes that step fail loudly, not silently. */
export interface RoutineHost {
  takeSlide?(a: { showId?: string; slideId?: string; index?: number }): void | Promise<void>;
  takeShow?(a: { showId: string; index?: number }): void | Promise<void>;
  cueFirstSong?(a: { showId?: string; take?: boolean }): void | Promise<void>;
  cue?(a: { refId: string }): void | Promise<void>;
  startCountdown?(a: { timerId: string; seconds: number; label?: string; showId?: string }): void | Promise<void>;
  stopCountdown?(a: { timerId: string }): void | Promise<void>;
  playPlaylist?(a: { playlistId?: string; name?: string; shuffle?: boolean; volume?: number }): void | Promise<void>;
  playAudio?(a: { src: string; volume?: number; loop?: boolean }): void | Promise<void>;
  stopAudio?(a?: { fadeSec?: number }): void | Promise<void>;
  setVolume?(a: { volume: number; fadeSec?: number }): void | Promise<void>;
  startVisualizer?(a: { sourceId: string }): void | Promise<void>;
  setScriptureLook?(a: { lookId: string }): void | Promise<void>;
  autoScripture?(a: { on: boolean }): void | Promise<void>;
  clearLayers?(a: { slot: string }): void | Promise<void>;
  openOutputs?(a: { layoutId?: string; outputIds?: string[] }): void | Promise<void>;
  closeOutputs?(a: { outputIds?: string[] }): void | Promise<void>;
  switchProject?(a: { projectId: string }): void | Promise<void>;
  showProp?(a: { propId: string }): void | Promise<void>;
  hideProp?(a: { propId?: string }): void | Promise<void>;
  switcherCut?(a: { sourceId: string }): void | Promise<void>;
}

/** What a step may touch of the engine. */
export interface EngineApi {
  runRoutine(id: string, depth: number): Promise<boolean>;
  startCountdown(id: string, seconds: number, label?: string): void;
  cancelCountdown(id: string): void;
  /** Seconds from `now` to the next start of a service time, or null. */
  secondsToService(serviceTimeId: string, now: number): number | null;
}

export interface StepContext {
  host: RoutineHost;
  engine: EngineApi;
  now(): number;
  sleep(ms: number): Promise<void>;
  depth: number;
  cancelled(): boolean;
}

export interface RegisteredAction {
  name: string;
  label: string;
  group: string;
  args: ArgSpec[];
  run(ctx: StepContext, args: Record<string, any>): void | Promise<void>;
}

export const SLOT_OPTIONS = ['all', 'background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'overlay', 'mask']
  .map(v => ({ value: v, label: v }));

function need<K extends keyof RoutineHost>(ctx: StepContext, m: K): NonNullable<RoutineHost[K]> {
  const f = ctx.host[m];
  if (typeof f !== 'function') throw new Error(`Not available in this window: ${String(m)}`);
  return (f as any).bind(ctx.host);
}
const str = (v: any) => (v == null ? '' : String(v));
const optStr = (v: any) => (v == null || v === '' ? undefined : String(v));
const num = (v: any, d?: number) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : d; };

export class ActionRegistry {
  private map = new Map<string, RegisteredAction>();
  register(a: RegisteredAction): this { this.map.set(a.name, a); return this; }
  get(name: string): RegisteredAction | undefined { return this.map.get(name); }
  list(): RegisteredAction[] { return [...this.map.values()]; }
  groups(): Array<{ group: string; actions: RegisteredAction[] }> {
    const g = new Map<string, RegisteredAction[]>();
    for (const a of this.map.values()) g.set(a.group, [...(g.get(a.group) ?? []), a]);
    return [...g.entries()].map(([group, actions]) => ({ group, actions }));
  }
  /** null = fine, else a human-readable problem. */
  validate(name: string, args: Record<string, any>): string | null {
    const a = this.map.get(name);
    if (!a) return `Unknown action "${name}"`;
    for (const s of a.args) {
      const v = args?.[s.key];
      const blank = v == null || v === '';
      if (blank && !s.optional && s.default === undefined) return `${a.label}: "${s.label}" is required`;
      if (!blank && s.kind === 'number' && !Number.isFinite(num(v))) return `${a.label}: "${s.label}" must be a number`;
    }
    return null;
  }
  /** Fill defaults + coerce numbers/bools so run() sees clean values. */
  normalize(name: string, args: Record<string, any>): Record<string, any> {
    const a = this.map.get(name);
    const out: Record<string, any> = { ...(args || {}) };
    for (const s of a?.args ?? []) {
      if (out[s.key] == null || out[s.key] === '') { if (s.default !== undefined) out[s.key] = s.default; continue; }
      if (s.kind === 'number') out[s.key] = num(out[s.key]);
      if (s.kind === 'bool') out[s.key] = out[s.key] === true || out[s.key] === 'true';
    }
    return out;
  }
  async run(name: string, args: Record<string, any>, ctx: StepContext): Promise<void> {
    const a = this.map.get(name);
    if (!a) throw new Error(`Unknown action "${name}"`);
    const bad = this.validate(name, args);
    if (bad) throw new Error(bad);
    await a.run(ctx, this.normalize(name, args));
  }
}

/** The built-in registry: every showModel Action plus the service-day verbs. */
export function createDefaultRegistry(): ActionRegistry {
  const R = new ActionRegistry();
  const reg = (name: string, label: string, group: string, args: ArgSpec[], run: RegisteredAction['run']) =>
    R.register({ name, label, group, args, run });

  // — Slides & presentations
  reg('slide.take', 'Take slide', 'Slides', [
    { key: 'showId', label: 'Show', kind: 'text', ref: 'show', optional: true },
    { key: 'slideId', label: 'Slide id', kind: 'text', optional: true },
    { key: 'index', label: 'Slide # (0 = first)', kind: 'number', optional: true, default: 0 },
  ], (c, a) => need(c, 'takeSlide')({ showId: optStr(a.showId), slideId: optStr(a.slideId), index: num(a.index, 0) }));
  reg('presentation.take', 'Take presentation', 'Slides', [
    { key: 'showId', label: 'Show / presentation', kind: 'text', ref: 'show' },
    { key: 'index', label: 'Start at slide #', kind: 'number', optional: true, default: 0 },
  ], (c, a) => need(c, 'takeShow')({ showId: str(a.showId), index: num(a.index, 0) }));
  reg('song.cueFirst', 'Queue first song', 'Slides', [
    { key: 'showId', label: 'Song (blank = first song in plan)', kind: 'text', ref: 'show', optional: true },
    { key: 'take', label: 'Take it live (not just preview)', kind: 'bool', optional: true, default: false },
  ], (c, a) => need(c, 'cueFirstSong')({ showId: optStr(a.showId), take: !!a.take }));
  reg('cue.fire', 'Cue / take reference', 'Slides', [
    { key: 'refId', label: 'Slide or show id', kind: 'text' },
  ], (c, a) => (c.host.cue ? c.host.cue({ refId: str(a.refId) }) : need(c, 'takeSlide')({ slideId: str(a.refId) })));
  reg('slide.goto', 'Go to slide', 'Slides', [
    { key: 'slideId', label: 'Slide id', kind: 'text' },
  ], (c, a) => need(c, 'takeSlide')({ slideId: str(a.slideId) }));

  // — Timers
  reg('timer.start', 'Start countdown timer', 'Timers', [
    { key: 'timerId', label: 'Timer id', kind: 'text', default: 'pre-service' },
    { key: 'seconds', label: 'Seconds (blank = until service time)', kind: 'number', optional: true },
    { key: 'serviceTimeId', label: 'Count to service time', kind: 'text', ref: 'serviceTime', optional: true },
    { key: 'label', label: 'Label', kind: 'text', optional: true, default: 'Service begins in' },
    { key: 'showId', label: 'Countdown slide to take', kind: 'text', ref: 'show', optional: true },
  ], async (c, a) => {
    let sec = num(a.seconds);
    if (sec == null && a.serviceTimeId) sec = c.engine.secondsToService(str(a.serviceTimeId), c.now()) ?? undefined;
    if (sec == null || sec <= 0) throw new Error('Countdown needs seconds or an upcoming service time');
    c.engine.startCountdown(str(a.timerId), sec, optStr(a.label));
    if (c.host.startCountdown) await c.host.startCountdown({ timerId: str(a.timerId), seconds: sec, label: optStr(a.label), showId: optStr(a.showId) });
  });
  reg('timer.reset', 'Reset timer', 'Timers', [
    { key: 'timerId', label: 'Timer id', kind: 'text', default: 'pre-service' },
  ], async (c, a) => { c.engine.cancelCountdown(str(a.timerId)); await c.host.stopCountdown?.({ timerId: str(a.timerId) }); });
  reg('wait', 'Wait', 'Timers', [
    { key: 'seconds', label: 'Seconds', kind: 'number', default: 5 },
  ], (c, a) => c.sleep(Math.max(0, num(a.seconds, 0)!) * 1000));

  // — Audio
  reg('audio.play', 'Play audio file', 'Audio', [
    { key: 'src', label: 'File / URL', kind: 'text' },
    { key: 'volume', label: 'Volume 0–1', kind: 'number', optional: true, default: 1 },
    { key: 'loop', label: 'Loop', kind: 'bool', optional: true, default: false },
  ], (c, a) => need(c, 'playAudio')({ src: str(a.src), volume: num(a.volume, 1), loop: !!a.loop }));
  reg('audio.stop', 'Stop audio', 'Audio', [
    { key: 'fadeSec', label: 'Fade out (sec)', kind: 'number', optional: true, default: 0 },
  ], (c, a) => need(c, 'stopAudio')({ fadeSec: num(a.fadeSec, 0) }));
  reg('playlist.play', 'Play playlist', 'Audio', [
    { key: 'playlistId', label: 'Playlist id', kind: 'text', ref: 'playlist', optional: true },
    { key: 'name', label: 'Or playlist name', kind: 'text', optional: true },
    { key: 'shuffle', label: 'Shuffle', kind: 'bool', optional: true, default: false },
    { key: 'volume', label: 'Volume 0–1', kind: 'number', optional: true },
  ], (c, a) => need(c, 'playPlaylist')({ playlistId: optStr(a.playlistId), name: optStr(a.name), shuffle: !!a.shuffle, volume: num(a.volume) }));
  reg('audio.volume', 'Set volume / fade', 'Audio', [
    { key: 'volume', label: 'Volume 0–1', kind: 'number' },
    { key: 'fadeSec', label: 'Fade over (sec)', kind: 'number', optional: true, default: 0 },
  ], (c, a) => need(c, 'setVolume')({ volume: Math.min(1, Math.max(0, num(a.volume, 1)!)), fadeSec: num(a.fadeSec, 0) }));

  // — Look
  reg('visualizer.start', 'Start visualizer', 'Look', [
    { key: 'sourceId', label: 'Visualizer / background id', kind: 'text', ref: 'visualizer' },
  ], (c, a) => need(c, 'startVisualizer')({ sourceId: str(a.sourceId) }));
  reg('scripture.look', 'Set scripture look', 'Look', [
    { key: 'lookId', label: 'Look id', kind: 'text', ref: 'look' },
  ], (c, a) => need(c, 'setScriptureLook')({ lookId: str(a.lookId) }));
  reg('autoscripture.start', 'Auto-scripture: start', 'Look', [], c => need(c, 'autoScripture')({ on: true }));
  reg('autoscripture.stop', 'Auto-scripture: stop', 'Look', [], c => need(c, 'autoScripture')({ on: false }));
  reg('layer.clear', 'Clear layer', 'Look', [
    { key: 'slot', label: 'Layer', kind: 'select', options: SLOT_OPTIONS, default: 'all' },
  ], (c, a) => need(c, 'clearLayers')({ slot: str(a.slot || 'all') }));
  reg('prop.show', 'Show prop', 'Look', [{ key: 'propId', label: 'Prop id', kind: 'text' }],
    (c, a) => need(c, 'showProp')({ propId: str(a.propId) }));
  reg('prop.hide', 'Hide prop', 'Look', [{ key: 'propId', label: 'Prop id (blank = all)', kind: 'text', optional: true }],
    (c, a) => need(c, 'hideProp')({ propId: optStr(a.propId) }));
  reg('switcher.cut', 'Switcher cut', 'Look', [{ key: 'sourceId', label: 'Source id', kind: 'text' }],
    (c, a) => need(c, 'switcherCut')({ sourceId: str(a.sourceId) }));

  // — Outputs, projects, routines
  reg('output.open', 'Open output windows', 'System', [
    { key: 'layoutId', label: 'Layout preset', kind: 'text', ref: 'layout', optional: true },
    { key: 'outputIds', label: 'Or output ids (comma separated)', kind: 'text', ref: 'output', optional: true },
  ], (c, a) => need(c, 'openOutputs')({
    layoutId: optStr(a.layoutId),
    outputIds: optStr(a.outputIds)?.split(',').map(s => s.trim()).filter(Boolean),
  }));
  reg('output.close', 'Close output windows', 'System', [
    { key: 'outputIds', label: 'Output ids (blank = all)', kind: 'text', ref: 'output', optional: true },
  ], (c, a) => need(c, 'closeOutputs')({ outputIds: optStr(a.outputIds)?.split(',').map(s => s.trim()).filter(Boolean) }));
  reg('project.switch', 'Switch project', 'System', [
    { key: 'projectId', label: 'Project', kind: 'text', ref: 'project' },
  ], (c, a) => need(c, 'switchProject')({ projectId: str(a.projectId) }));
  const runNested = async (c: StepContext, id: string) => {
    if (c.depth >= MAX_NEST_DEPTH) throw new Error('Routines nested too deeply');
    const ok = await c.engine.runRoutine(id, c.depth + 1);
    if (!ok) throw new Error(`Routine "${id}" failed or was not found`);
  };
  reg('routine.run', 'Run another routine', 'System', [
    { key: 'routineId', label: 'Routine', kind: 'text', ref: 'routine' },
  ], (c, a) => runNested(c, str(a.routineId)));
  // showModel MACRO ids are routine ids.
  reg('macro.run', 'Run macro', 'System', [
    { key: 'macroId', label: 'Macro (routine id)', kind: 'text', ref: 'routine' },
  ], (c, a) => runNested(c, str(a.macroId)));
  return R;
}

// ── showModel Action → registry ──────────────────────────────────────────────

/** Map a slide Action onto the registry. This is what gives MACRO/CUE/PROP_SHOW/SWITCHER_CUT a real implementation. */
export function actionToStep(a: Action): { fn: string; args: Record<string, any> } {
  switch (a.kind) {
    case 'AUDIO_PLAY': return { fn: 'audio.play', args: { src: a.src, volume: a.volume ?? 1 } };
    case 'AUDIO_STOP': return { fn: 'audio.stop', args: {} };
    case 'TIMER_START': return { fn: 'timer.start', args: { timerId: a.timerId, seconds: a.seconds } };
    case 'TIMER_RESET': return { fn: 'timer.reset', args: { timerId: a.timerId } };
    case 'CLEAR_LAYER': return { fn: 'layer.clear', args: { slot: a.slot } };
    case 'PROP_SHOW': return { fn: 'prop.show', args: { propId: a.propId } };
    case 'PROP_HIDE': return { fn: 'prop.hide', args: {} };
    case 'GOTO': return { fn: 'slide.goto', args: { slideId: a.slideId } };
    case 'MACRO': return { fn: 'macro.run', args: { macroId: a.macroId } };
    case 'SWITCHER_CUT': return { fn: 'switcher.cut', args: { sourceId: a.sourceId } };
    case 'CUE': return { fn: 'cue.fire', args: { refId: a.refId } };
  }
}

/** Run a slide's onEnter/onExit through the registry. Failures are collected, never thrown. */
export async function dispatchActions(
  actions: Action[] | undefined, ctx: StepContext, registry: ActionRegistry,
): Promise<StepLog[]> {
  const out: StepLog[] = [];
  for (const a of actions ?? []) {
    const { fn, args } = actionToStep(a);
    const t0 = ctx.now();
    try { await registry.run(fn, args, ctx); out.push({ fn, ok: true, ms: ctx.now() - t0 }); }
    catch (e: any) { out.push({ fn, ok: false, error: e?.message || String(e), ms: ctx.now() - t0 }); }
  }
  return out;
}

/** Group steps into batches: a `parallel` step joins the previous step's batch. */
export function batchSteps(steps: RoutineStep[]): RoutineStep[][] {
  const batches: RoutineStep[][] = [];
  for (const s of steps) {
    if (s.enabled === false) continue;
    if (s.parallel && batches.length) batches[batches.length - 1].push(s);
    else batches.push([s]);
  }
  return batches;
}

// ── Engine ───────────────────────────────────────────────────────────────────

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; }
export const ROUTINES_KEY = 'ambo_routines_v1';

export interface EngineOptions {
  storage?: KV | null;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  registry?: ActionRegistry;
  host?: RoutineHost;
  defaultGraceMin?: number;
}

export class RoutineEngine implements EngineApi {
  private data: RoutineData;
  private host: RoutineHost;
  private listeners = new Set<() => void>();
  private running = new Set<string>();
  private cancelled = new Set<string>();
  readonly registry: ActionRegistry;
  private clock: () => number;
  private sleepFn: (ms: number) => Promise<void>;
  private storage: KV | null;
  private opts: EngineOptions;
  private version = 0;

  constructor(opts: EngineOptions = {}) {
    this.opts = opts;
    this.clock = opts.clock ?? (() => Date.now());
    this.sleepFn = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    this.registry = opts.registry ?? createDefaultRegistry();
    this.host = opts.host ?? {};
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.data = this.load();
  }

  // — state
  private load(): RoutineData {
    try {
      const raw = this.storage?.getItem(ROUTINES_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          ...emptyData(), ...p,
          routines: Array.isArray(p.routines) ? p.routines : [],
          serviceTimes: Array.isArray(p.serviceTimes) ? p.serviceTimes : [],
          locations: Array.isArray(p.locations) ? p.locations : [],
          lastRun: p.lastRun && typeof p.lastRun === 'object' ? p.lastRun : {},
          log: Array.isArray(p.log) ? p.log.slice(0, MAX_LOG) : [],
          countdowns: Array.isArray(p.countdowns) ? p.countdowns : [],
        };
      }
    } catch { /* corrupt → start clean */ }
    return emptyData();
  }
  private commit() {
    this.version++;
    try { this.storage?.setItem(ROUTINES_KEY, JSON.stringify(this.data)); } catch { /* quota */ }
    this.listeners.forEach(l => l());
  }
  getData = (): RoutineData => this.data;
  getVersion = (): number => this.version;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  setHost(h: RoutineHost) { this.host = h; }
  now() { return this.clock(); }
  isRunning(id: string) { return this.running.has(id); }
  private ctx(): ScheduleContext { return { serviceTimes: this.data.serviceTimes, locations: this.data.locations }; }

  // — CRUD
  upsertRoutine(r: Routine) {
    const i = this.data.routines.findIndex(x => x.id === r.id);
    this.data = { ...this.data, routines: i < 0 ? [...this.data.routines, r] : this.data.routines.map(x => x.id === r.id ? r : x) };
    this.commit();
  }
  removeRoutine(id: string) {
    const { [id]: _drop, ...lastRun } = this.data.lastRun;
    this.data = { ...this.data, routines: this.data.routines.filter(r => r.id !== id), lastRun };
    this.commit();
  }
  upsertServiceTime(s: ServiceTime) {
    const i = this.data.serviceTimes.findIndex(x => x.id === s.id);
    this.data = { ...this.data, serviceTimes: i < 0 ? [...this.data.serviceTimes, s] : this.data.serviceTimes.map(x => x.id === s.id ? s : x) };
    this.commit();
  }
  removeServiceTime(id: string) { this.data = { ...this.data, serviceTimes: this.data.serviceTimes.filter(s => s.id !== id) }; this.commit(); }
  upsertLocation(l: Location) {
    const i = this.data.locations.findIndex(x => x.id === l.id);
    this.data = { ...this.data, locations: i < 0 ? [...this.data.locations, l] : this.data.locations.map(x => x.id === l.id ? l : x) };
    this.commit();
  }
  removeLocation(id: string) { this.data = { ...this.data, locations: this.data.locations.filter(l => l.id !== id) }; this.commit(); }
  /** Install a template bundle (e.g. Sunday Service). Replaces items with the same id. */
  install(bundle: { locations?: Location[]; serviceTimes?: ServiceTime[]; routines?: Routine[] }) {
    const merge = <T extends { id: string }>(a: T[], b: T[] = []) => [...a.filter(x => !b.some(y => y.id === x.id)), ...b];
    this.data = {
      ...this.data,
      locations: merge(this.data.locations, bundle.locations),
      serviceTimes: merge(this.data.serviceTimes, bundle.serviceTimes),
      routines: merge(this.data.routines, bundle.routines),
    };
    this.commit();
  }
  clearLog() { this.data = { ...this.data, log: [] }; this.commit(); }

  // — countdowns (EngineApi)
  startCountdown(id: string, seconds: number, label = 'Countdown') {
    const now = this.now();
    this.data = { ...this.data, countdowns: [...this.data.countdowns.filter(c => c.id !== id), { id, label, startedAt: now, endsAt: now + seconds * 1000 }] };
    this.commit();
  }
  cancelCountdown(id: string) {
    if (!this.data.countdowns.some(c => c.id === id)) return;
    this.data = { ...this.data, countdowns: this.data.countdowns.filter(c => c.id !== id) };
    this.commit();
  }
  secondsToService(serviceTimeId: string, now: number): number | null {
    const st = this.data.serviceTimes.find(s => s.id === serviceTimeId);
    if (!st) return null;
    const at = nextRunAt({ id: '_', name: '', enabled: true, steps: [], trigger: { kind: 'service', serviceTimeId, offsetMin: 0 } }, this.ctx(), now);
    return at == null ? null : Math.round((at - now) / 1000);
  }

  // — preview helpers
  nextRun(r: Routine, after = this.now()): number | null { return nextRunAt(r, this.ctx(), after); }
  nextScheduled(after = this.now()): { routine: Routine; at: number } | null {
    let best: { routine: Routine; at: number } | null = null;
    for (const r of this.data.routines) {
      if (!r.enabled) continue;
      const at = nextRunAt(r, this.ctx(), after);
      if (at != null && (!best || at < best.at)) best = { routine: r, at };
    }
    return best;
  }

  // — execution
  private log(e: RunLogEntry) {
    this.data = { ...this.data, log: [e, ...this.data.log].slice(0, MAX_LOG) };
    this.commit();
  }

  /** Run a routine now. Resolves true when every step succeeded. */
  async runRoutine(id: string, depth = 0, reason: RunLogEntry['reason'] = depth > 0 ? 'nested' : 'manual', note?: string): Promise<boolean> {
    const r = this.data.routines.find(x => x.id === id);
    if (!r) return false;
    if (this.running.has(id)) {
      this.log({ id: rid('log'), routineId: id, routineName: r.name, at: this.now(), reason, ok: false, note: 'Skipped — already running', steps: [] });
      return false;
    }
    this.running.add(id);
    this.cancelled.delete(id);
    this.commit();
    const steps: StepLog[] = [];
    let ok = true;
    const sctx: StepContext = {
      host: this.host, engine: this, now: () => this.now(),
      sleep: ms => this.sleepFn(ms), depth, cancelled: () => this.cancelled.has(id),
    };
    try {
      for (const batch of batchSteps(r.steps)) {
        if (this.cancelled.has(id)) { note = note ?? 'Cancelled'; break; }
        const results = await Promise.all(batch.map(async s => {
          const t0 = this.now();
          try {
            if (s.delaySec) await this.sleepFn(s.delaySec * 1000);
            await this.registry.run(s.fn, s.args ?? {}, sctx);
            return { fn: s.fn, ok: true, ms: this.now() - t0 } as StepLog;
          } catch (e: any) {
            return { fn: s.fn, ok: false, error: e?.message || String(e), ms: this.now() - t0 } as StepLog;
          }
        }));
        steps.push(...results);
        if (results.some(x => !x.ok)) { ok = false; if (r.stopOnError) break; }
      }
    } finally {
      this.running.delete(id);
    }
    this.log({ id: rid('log'), routineId: id, routineName: r.name, at: this.now(), reason, ok, note, steps });
    // Chaining: "when routine X finishes" triggers.
    if (depth < MAX_NEST_DEPTH) void this.fireEvent({ event: 'routine-finished', key: id }, depth + 1);
    return ok;
  }

  cancel(id: string) { if (this.running.has(id)) this.cancelled.add(id); }

  /** Run every enabled routine whose event trigger matches. */
  async fireEvent(ev: { event: RoutineEventName; key?: string }, depth = 0): Promise<number> {
    if (depth > MAX_NEST_DEPTH) return 0;
    const hits = this.data.routines.filter(r => r.enabled && r.trigger.kind === 'event'
      && r.trigger.event === ev.event && (r.trigger.key == null || r.trigger.key === '' || r.trigger.key === ev.key));
    await Promise.all(hits.map(r => this.runRoutine(r.id, depth, 'event', `${ev.event}${ev.key ? ` · ${ev.key}` : ''}`)));
    return hits.length;
  }

  /**
   * One scheduler beat (call about once a second). Runs due routines, records
   * missed ones, and fires countdown-ended events.
   */
  tick(now = this.now()): Promise<unknown> {
    const jobs: Array<Promise<unknown>> = [];
    const due = dueRoutines(this.data.routines, this.ctx(), now, this.data.lastRun, { defaultGraceMin: this.opts.defaultGraceMin });
    if (due.length) {
      const lastRun = { ...this.data.lastRun };
      for (const d of due) lastRun[d.routine.id] = d.scheduledAt;
      this.data = { ...this.data, lastRun };
      this.commit();
      for (const d of due) {
        if (d.run) jobs.push(this.runRoutine(d.routine.id, 0, 'schedule',
          d.lateMs > 60000 ? `Ran ${Math.round(d.lateMs / 60000)} min late (app was closed)` : undefined));
        else this.log({ id: rid('log'), routineId: d.routine.id, routineName: d.routine.name, at: now, reason: 'missed', ok: false,
          note: `Missed by ${Math.round(d.lateMs / 60000)} min — outside the grace window, not run`, steps: [] });
      }
    }
    const ended = this.data.countdowns.filter(c => c.endsAt <= now);
    if (ended.length) {
      this.data = { ...this.data, countdowns: this.data.countdowns.filter(c => c.endsAt > now) };
      this.commit();
      for (const c of ended) {
        // A countdown that finished while the app was closed is stale — don't fire the opening at the wrong time.
        if (now - c.endsAt <= 30000) jobs.push(this.fireEvent({ event: 'countdown-ended', key: c.id }));
      }
    }
    return Promise.all(jobs);
  }
}

function defaultStorage(): KV | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ── Sunday Service template ──────────────────────────────────────────────────

export interface SundayTemplateOptions {
  timezone?: string;
  time?: string;           // service start, 'HH:MM'
  weekday?: number;
  countdownMin?: number;   // lead time before the service (default 15)
  playlistId?: string;
  playlistName?: string;
  openingAudio?: string;   // file/URL for the opening sting
  visualizerId?: string;
  firstSongShowId?: string;
  layoutId?: string;
}

export const SUNDAY_IDS = {
  location: 'loc_main', service: 'svc_sunday', pre: 'rtn_sunday_pre', open: 'rtn_sunday_open', timer: 'pre-service',
} as const;

/**
 * The ready-made chain: T-15 → countdown + music playlist (+ outputs);
 * when the countdown ends → opening audio, visualizer, first song cued and first slide taken.
 */
export function sundayServiceTemplate(o: SundayTemplateOptions = {}): { locations: Location[]; serviceTimes: ServiceTime[]; routines: Routine[] } {
  const lead = o.countdownMin ?? 15;
  const location: Location = { id: SUNDAY_IDS.location, name: 'Main Sanctuary', timezone: o.timezone || localTimezone(), outputPresetId: o.layoutId };
  const service: ServiceTime = {
    id: SUNDAY_IDS.service, name: 'Sunday Service', weekday: o.weekday ?? 0, time: o.time || '10:00',
    durationMin: 75, locationId: location.id, enabled: true,
  };
  const pre: Routine = {
    id: SUNDAY_IDS.pre, name: `Pre-service (T-${lead} min)`, enabled: true, locationId: location.id, graceMin: 5,
    trigger: { kind: 'service', serviceTimeId: service.id, offsetMin: -lead },
    steps: [
      ...(o.layoutId ? [{ id: 's0', fn: 'output.open', args: { layoutId: o.layoutId } }] : []),
      { id: 's1', fn: 'timer.start', args: { timerId: SUNDAY_IDS.timer, serviceTimeId: service.id, label: 'Service begins in' }, parallel: !!o.layoutId },
      { id: 's2', fn: 'playlist.play', args: { playlistId: o.playlistId ?? '', name: o.playlistName ?? '', volume: 0.8 }, parallel: true },
    ],
  };
  const open: Routine = {
    id: SUNDAY_IDS.open, name: 'Service opening (countdown ends)', enabled: true, locationId: location.id,
    trigger: { kind: 'event', event: 'countdown-ended', key: SUNDAY_IDS.timer },
    steps: [
      { id: 'o1', fn: 'audio.stop', args: { fadeSec: 2 } },
      { id: 'o2', fn: 'audio.play', args: { src: o.openingAudio ?? '', volume: 1 } },
      { id: 'o3', fn: 'visualizer.start', args: { sourceId: o.visualizerId ?? '' }, parallel: true },
      { id: 'o4', fn: 'song.cueFirst', args: { showId: o.firstSongShowId ?? '', take: false }, parallel: true },
      { id: 'o5', fn: 'slide.take', args: { showId: o.firstSongShowId ?? '', index: 0 }, delaySec: 3 },
    ],
  };
  return { locations: [location], serviceTimes: [service], routines: [pre, open] };
}
